"""Strict nested validation for saved report contracts, including legacy runs."""
import math
from datetime import datetime
from typing import Any
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, field_validator, model_validator


class Model(BaseModel):
    model_config = ConfigDict(extra='allow')


class Finding(Model):
    column: str = Field(min_length=1)
    rule: str = Field(min_length=1)
    row_ref: str = Field(min_length=1, max_length=128)
    recommendation: str


class Validation(Model):
    issues: list[Finding]
    checks: StrictInt = Field(ge=0)
    issue_count: StrictInt = Field(ge=0)
    score: float | None

    @field_validator('score', mode='before')
    @classmethod
    def score_number(cls, value):
        if value is not None and (type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 100):
            raise ValueError('Invalid score')
        return value

    @model_validator(mode='after')
    def totals(self):
        if self.issue_count != len(self.issues) or self.issue_count > self.checks:
            raise ValueError('Inconsistent issue totals')
        expected = round(100*(self.checks-self.issue_count)/self.checks, 2) if self.checks else None
        if self.score != expected:
            raise ValueError('Score does not match check totals')
        return self


class Profile(Model):
    missing: StrictInt = Field(ge=0)
    distinct: StrictInt = Field(ge=0)
    types: list[str]
    pii: StrictBool


class SensitiveColumn(Model):
    categories: list[str]
    nonempty_count: StrictInt = Field(ge=0)
    method: str
    confidence: str


class Anomaly(Model):
    column: str
    method: str
    row_ref: str
    recommendation: str


class Change(Model):
    column: str
    rule: str
    row_ref: str
    before: Any
    after: Any
    applied_to: str


class Step(Model):
    step: StrictInt = Field(ge=1)
    selected_tool: str
    available_tools: list[str]
    observation: dict[str, Any]
    plan: list[str] | None = None


class Agent(Model):
    mode: str
    ai_used: StrictBool
    trace: list[Step]


class Dataset(Model):
    connection_id: str
    connection_name: str
    schema_name: str = Field(alias='schema')
    table: str


class Assessment(Model):
    hash: str = Field(pattern=r'^[a-f0-9]{64}$')
    engine_version: str
    sampling_version: str
    policy: dict[str, Any]

    @model_validator(mode='after')
    def policy_digest(self):
        from app.lab.engine import digest
        from app.lab.row_references import packed
        if self.hash != digest(packed({'engine_version':self.engine_version,
            'sampling_version':self.sampling_version,'policy':self.policy})):
            raise ValueError('Assessment policy hash mismatch')
        return self


class SavedReport(Model):
    run_id: UUID
    parent_run_id: UUID | None = None
    root_run_id: UUID | None = None
    created_at: datetime
    extracted_at: datetime | None = None
    status: str
    dataset: Dataset
    sample_count: StrictInt = Field(ge=1)
    population_count: StrictInt = Field(ge=1)
    column_count: StrictInt = Field(ge=1)
    validation: Validation
    after_validation: Validation
    profiles: dict[str, Profile]
    pii: dict[str, SensitiveColumn]
    anomalies: list[Anomaly]
    changes: list[Change]
    agent: Agent
    limitations: list[str]
    recommendations: list[str]
    assessment: Assessment | None = None

    @field_validator('created_at', 'extracted_at', mode='before')
    @classmethod
    def timestamp(cls, value):
        if value is None:
            return value
        if not isinstance(value, str) or datetime.fromisoformat(value).tzinfo is None:
            raise ValueError('A timezone-aware ISO timestamp is required')
        return value

    @model_validator(mode='after')
    def consistent(self):
        if self.status != 'completed' or self.sample_count > self.population_count or len(self.profiles) != self.column_count:
            raise ValueError('Inconsistent report scope')
        if any(p.missing > self.sample_count or p.distinct > self.sample_count for p in self.profiles.values()):
            raise ValueError('Invalid column counts')
        return self


def validate_report(report):
    SavedReport.model_validate(report)
    return report
