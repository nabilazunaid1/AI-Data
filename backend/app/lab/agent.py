"""Bounded model-selected tool execution. No raw rows or generated SQL."""
import json
import os
import urllib.request


def ollama_decision(observation):
    prompt = ('Choose the next data quality tool. Return JSON only: '
        '{"plan":["available tool names in intended execution order"]}. '
        'Choose at least one tool. Copy tool names exactly from available_tools. '
        'Use observations to decide the next step. Never invent observations.\n' + json.dumps(observation))
    schema = {'type': 'object', 'properties': {
        'plan': {'type': 'array', 'items': {'type': 'string', 'enum': observation['available_tools']},
                 'minItems': 1, 'maxItems': len(observation['available_tools'])}},
        'required': ['plan'], 'additionalProperties': False}
    request = urllib.request.Request(os.getenv('OLLAMA_URL', 'http://127.0.0.1:11434/api/generate'),
        data=json.dumps({'model': os.getenv('OLLAMA_MODEL', 'gemma3:1b'), 'prompt': prompt,
                         'stream': False, 'format': schema, 'keep_alive': '1m',
                         'options': {'temperature': 0, 'num_ctx': 1024, 'num_predict': 128}}).encode(),
        headers={'Content-Type': 'application/json'})
    timeout = min(180, max(5, int(os.getenv('QUALITY_AI_TIMEOUT_SECONDS', '90'))))
    with urllib.request.urlopen(request, timeout=timeout) as response:
        data = json.load(response)
        if not data.get('done') or data.get('done_reason') == 'length':
            raise ValueError('Model response was incomplete.')
        plan = json.loads(data['response']).get('plan')
        if not isinstance(plan, list) or not plan or any(name not in observation['available_tools'] for name in plan):
            raise ValueError('Model returned an invalid plan.')
        # The model selects the action through the first step of its plan.
        # This avoids contradictory independent `tool` and `plan` fields.
        return {'plan': plan, 'tool': plan[0]}


def execute_tools(tools, use_ai=False, decide=None):
    results, trace = {}, []
    decide = decide or ollama_decision
    for step in range(8):
        available = [name for name in tools if name not in results]
        if not available:
            return {'mode': 'llm_tool_agent' if use_ai else 'deterministic',
                    'ai_used': use_ai, 'trace': trace}
        # No user strings, column values, identifiers or PII enter the model prompt.
        observations = {name: {'completed': True, 'finding_count': value.get('finding_count', 0)}
                        for name, value in results.items()}
        decision = decide({'goal': 'Inspect quality, validate evidence and produce a report',
            'available_tools': available, 'observations': observations}) if use_ai else {
                'plan': available, 'tool': available[0], 'reason': 'Configured deterministic execution'}
        tool = decision.get('tool')
        plan = decision.get('plan')
        if not isinstance(plan, list) or not plan or any(name not in available for name in plan) or tool not in plan:
            raise ValueError('Agent must provide a plan containing only available tools.')
        if tool not in available:
            raise ValueError('Agent selected unavailable or repeated tool; run aborted.')
        result = tools[tool]()
        results[tool] = result
        # Reason text from the model is deliberately not persisted (PII/hallucination risk).
        trace.append({'step': step+1, 'available_tools': available, 'plan': plan, 'selected_tool': tool,
                      'observation': result})
    raise ValueError('Agent step budget exceeded')
