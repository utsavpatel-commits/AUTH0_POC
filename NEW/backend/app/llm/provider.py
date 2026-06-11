"""Thin LLM provider abstraction.

Primary: Anthropic. Optional: OpenAI. Fallback: a deterministic stub so the demo
always runs offline with no API key. Every AI-originated *write* in the app still
flows through a human-approve step in the calling code — this module only produces
suggested text.
"""
from __future__ import annotations

from app.core.config import settings


def is_live() -> bool:
    if settings.llm_provider == "anthropic" and settings.anthropic_api_key:
        return True
    if settings.llm_provider == "openai" and settings.openai_api_key:
        return True
    return False


def generate(prompt: str, *, system: str | None = None, max_tokens: int = 700) -> str:
    """Return model text, or a deterministic stub when no provider is configured."""
    provider = settings.llm_provider
    try:
        if provider == "anthropic" and settings.anthropic_api_key:
            return _anthropic(prompt, system, max_tokens)
        if provider == "openai" and settings.openai_api_key:
            return _openai(prompt, system, max_tokens)
    except Exception as exc:  # pragma: no cover - network/credential failures
        return _stub(prompt, system, note=f"(LLM call failed: {exc}; showing stub)")
    return _stub(prompt, system)


def _anthropic(prompt: str, system: str | None, max_tokens: int) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    msg = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=max_tokens,
        system=system or "You are a long-term-care compliance assistant.",
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in msg.content if block.type == "text")


def _openai(prompt: str, system: str | None, max_tokens: int) -> str:
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    resp = client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system or "You are a long-term-care compliance assistant."},
            {"role": "user", "content": prompt},
        ],
    )
    return resp.choices[0].message.content or ""


def _stub(prompt: str, system: str | None, note: str = "") -> str:
    """Deterministic, plausible response keyed off the prompt's intent."""
    p = prompt.lower()
    prefix = "AI suggestion (demo stub). Connect an LLM key for live generation."
    if note:
        prefix = note
    if "f-tag" in p or "ftag" in p or "citation" in p:
        body = (
            "Likely deficiency: F684 (Quality of Care). The observation pattern suggests "
            "care was not provided consistent with the resident's assessment and care plan. "
            "Recommend reviewing the care plan, recent assessments, and staff documentation."
        )
    elif "summar" in p:
        body = (
            "Summary: This policy establishes facility procedures and staff responsibilities. "
            "Key points: scope, responsible roles, required documentation, and review cadence. "
            "Staff should acknowledge the current version and complete any linked training."
        )
    elif "corrective" in p or "plan of correction" in p or "poc" in p:
        body = (
            "Proposed corrective action: (1) what went wrong — gap in adherence to policy; "
            "(2) how it was assessed across the facility — audit of affected residents/units; "
            "(3) staff education — assign targeted in-service training to involved roles; "
            "(4) ongoing monitoring — scheduled re-audit at 30/60/90 days with QA review."
        )
    elif "training" in p or "gap" in p:
        body = (
            "Recommended training: assign the relevant in-service to affected staff by role. "
            "Prioritize staff with overdue mandatory courses; set a 14-day due date."
        )
    else:
        body = (
            "Based on the provided context, here is a concise, compliance-aware response "
            "drawing on the facility's policies, training records, and recent findings."
        )
    return f"{prefix}\n\n{body}"
