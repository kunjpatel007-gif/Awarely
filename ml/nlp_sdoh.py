"""
=============================================================================
The Vanishing Dose — Social Determinants of Health (SDOH) NLP Engine
Author / Implementer: Person A Task (Completed)
Repository Root: D:/manipal h/Hackathon-Manipal

PURPOSE:
Extracts unencoded Social Determinants of Health (SDOH) barriers from unstructured
clinical notes, discharge summaries, or encounter transcripts using spaCy PhraseMatcher.
Identifies transport, financial, housing, and food security barriers contributing to
indirect medication non-adherence.
=============================================================================
"""

import spacy
from spacy.matcher import PhraseMatcher
from typing import Dict, Any, List

# Initialize spaCy blank English pipeline
nlp = spacy.blank("en")

# Define clinical SDOH lexicons
SDOH_CATEGORIES = {
    "has_transport_issue": [
        "lost ride", "no car", "missed bus", "bus broke down", "cannot drive",
        "transportation barrier", "transit issue", "no transportation", "no ride",
        "ride cancelled", "bus pass expired", "cannot afford gas", "too far to travel",
        "walked two miles", "mobility barrier"
    ],
    "has_financial_stress": [
        "lost job", "unemployed", "cannot afford", "copay too high", "expensive medication",
        "financial stress", "financial hardship", "cost prohibitive", "no insurance",
        "lost coverage", "gap in coverage", "out of pocket", "rationing pills",
        "splitting doses due to cost", "skipped dose to save money"
    ],
    "has_housing_instability": [
        "homeless", "eviction", "shelter", "unstable housing", "temporary lodging",
        "living in vehicle", "couch surfing", "lost apartment", "no permanent address",
        "displaced"
    ],
    "has_food_insecurity": [
        "food pantry", "skipped meals", "hunger", "food insecurity", "cannot afford groceries",
        "snap benefits", "food assistance", "food bank", "prioritizing food over medicine"
    ]
}

# Pre-build PhraseMatcher
_matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
for category, phrases in SDOH_CATEGORIES.items():
    patterns = [nlp.make_doc(text) for text in phrases]
    _matcher.add(category, patterns)


def extract_sdoh_flags(clinical_note: str) -> Dict[str, Any]:
    """
    Parses clinical text and extracts structured SDOH risk flags and matched evidence.

    Args:
        clinical_note: Raw text string from clinical progress note or nurse triage note.

    Returns:
        Dict containing boolean flags for each SDOH category, matched keyphrases,
        and an overall SDOH risk score.
    """
    if not clinical_note or not isinstance(clinical_note, str):
        return {
            "has_transport_issue": False,
            "has_financial_stress": False,
            "has_housing_instability": False,
            "has_food_insecurity": False,
            "matched_terms": {},
            "sdoh_burden_score": 0.0
        }

    doc = nlp(clinical_note)
    matches = _matcher(doc)

    matched_categories = set()
    matched_terms = {}

    for match_id, start, end in matches:
        category_name = nlp.vocab.strings[match_id]
        matched_categories.add(category_name)
        span_text = doc[start:end].text
        if category_name not in matched_terms:
            matched_terms[category_name] = []
        if span_text not in matched_terms[category_name]:
            matched_terms[category_name].append(span_text)

    # Compute overall burden score (0.0 to 1.0)
    burden_score = round(len(matched_categories) / float(len(SDOH_CATEGORIES)), 2)

    return {
        "has_transport_issue": "has_transport_issue" in matched_categories,
        "has_financial_stress": "has_financial_stress" in matched_categories,
        "has_housing_instability": "has_housing_instability" in matched_categories,
        "has_food_insecurity": "has_food_insecurity" in matched_categories,
        "matched_terms": matched_terms,
        "sdoh_burden_score": burden_score
    }


if __name__ == "__main__":
    # Test clinical note
    test_note = (
        "Patient arrived 45 minutes late to appointment. Stated she has no car and missed bus "
        "transfer twice this morning. Patient mentioned she recently lost job at retail store and "
        "cannot afford copay for her cardioprotective prescriptions this month."
    )
    result = extract_sdoh_flags(test_note)
    print("SDOH NLP Extraction Output:")
    import json
    print(json.dumps(result, indent=2))
