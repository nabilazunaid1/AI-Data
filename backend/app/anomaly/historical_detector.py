"""Read-only statistical analysis of historical SQL aggregates.

No database writes, raw customer records, or AI inference.
"""

from math import isfinite
from statistics import median


MINIMUM_PERIODS = 12
MINIMUM_RECORDS_PER_PERIOD = 3
ROBUST_Z_THRESHOLD = 3.5

# metric key: (display name, direction, minimum absolute change)
METRICS = {
    "avg_quality_score": (
        "Average quality score",
        "lower",
        5.0,
    ),
    "missing_rate": (
        "Missing-value occurrences per record",
        "higher",
        0.5,
    ),
    "duplicate_rate": (
        "Duplicate occurrences per record",
        "higher",
        0.5,
    ),
    "invalid_rate": (
        "Invalid-value occurrences per record",
        "higher",
        0.5,
    ),
    "avg_processing_ms": (
        "Average processing time (ms)",
        "higher",
        50.0,
    ),
    "avg_queue_wait_ms": (
        "Average queue wait (ms)",
        "higher",
        30.0,
    ),
}


def _number(value):
    if isinstance(value, bool) or not isinstance(
        value, (int, float)
    ):
        return None

    value = float(value)
    return value if isfinite(value) else None


def _normalized_periods(periods):
    normalized = []

    for period in periods:
        count = period.get("record_count")
        if not isinstance(count, int) or count < (
            MINIMUM_RECORDS_PER_PERIOD
        ):
            continue

        item = {
            "period_start": str(period["period_start"]),
            "record_count": count,
        }

        for field in (
            "avg_quality_score",
            "avg_processing_ms",
            "avg_queue_wait_ms",
        ):
            item[field] = _number(period.get(field))

        for field, total_field in (
            ("missing_rate", "missing_total"),
            ("duplicate_rate", "duplicate_total"),
            ("invalid_rate", "invalid_total"),
        ):
            total = _number(period.get(total_field))
            item[field] = (
                total / count if total is not None else None
            )

        normalized.append(item)

    return sorted(
        normalized,
        key=lambda item: item["period_start"],
    )


def detect_monthly_outliers(trend):
    """Detect retrospective outliers in monthly aggregate metrics.

    Baselines exclude the observation being evaluated.
    Scores are statistical signals, not root-cause proof.
    """
    if not isinstance(trend, dict):
        raise ValueError("Invalid historical trend response.")

    if trend.get("granularity") != "month":
        raise ValueError("Monthly aggregation is required.")

    if trend.get("read_only") is not True:
        raise ValueError("Verified read-only evidence required.")

    if trend.get("raw_records_included") is not False:
        raise ValueError("Raw-record exposure is not permitted.")

    periods = trend.get("periods")
    if not isinstance(periods, list):
        raise ValueError("Historical periods are missing.")

    normalized = _normalized_periods(periods)

    response = {
        "status": "success",
        "method": "modified_z_score_median_mad",
        "analysis_type": "retrospective_monthly_outliers",
        "dataset_type": trend.get("dataset_type"),
        "timezone": trend.get("timezone"),
        "available_periods": len(periods),
        "eligible_periods": len(normalized),
        "minimum_periods": MINIMUM_PERIODS,
        "minimum_records_per_period":
            MINIMUM_RECORDS_PER_PERIOD,
        "z_threshold": ROBUST_Z_THRESHOLD,
        "read_only": True,
        "ai_used": False,
        "raw_records_included": False,
        "findings": [],
    }

    if len(normalized) < MINIMUM_PERIODS:
        response["assessment"] = "insufficient_history"
        response["message"] = (
            "At least 12 eligible monthly observations "
            "are required for this statistical baseline."
        )
        return response

    findings = []

    for metric, (label, direction, min_change) in (
        METRICS.items()
    ):
        for candidate in normalized:
            actual = candidate.get(metric)

            if actual is None:
                continue

            reference = [
                item[metric]
                for item in normalized
                if item is not candidate
                and item.get(metric) is not None
            ]

            if len(reference) < MINIMUM_PERIODS - 1:
                continue

            baseline = median(reference)
            mad = median(
                abs(value - baseline)
                for value in reference
            )

            # A zero-MAD baseline cannot produce a reliable
            # finite modified Z-score. Do not force a finding.
            if mad == 0:
                continue

            difference = actual - baseline

            if direction == "lower":
                adverse_change = -difference
            else:
                adverse_change = difference

            if adverse_change < min_change:
                continue

            score = (
                0.6745 * abs(difference) / mad
            )

            if score < ROBUST_Z_THRESHOLD:
                continue

            # Prevent tiny proportional changes in latency
            # from generating warnings.
            if metric in (
                "avg_processing_ms",
                "avg_queue_wait_ms",
            ):
                if baseline > 0 and actual < baseline * 1.5:
                    continue

            findings.append({
                "period_start": candidate["period_start"],
                "metric": metric,
                "metric_label": label,
                "actual": round(actual, 3),
                "baseline_median": round(baseline, 3),
                "absolute_change": round(difference, 3),
                "modified_z_score": round(score, 3),
                "direction": direction,
                "reference_periods": len(reference),
                "record_count": candidate["record_count"],
                "assessment": "statistical_outlier",
            })

    response["findings"] = sorted(
        findings,
        key=lambda item: (
            -item["modified_z_score"],
            item["period_start"],
            item["metric"],
        ),
    )

    response["finding_count"] = len(findings)
    response["assessment"] = (
        "outliers_detected"
        if findings
        else "no_outliers_detected"
    )

    response["limitations"] = (
        "Retrospective statistical comparison only. "
        "This method does not establish causation, "
        "weekday patterns, annual seasonality, or "
        "forecasting accuracy. A zero-MAD metric is "
        "not assessed by this detector."
    )

    return response
