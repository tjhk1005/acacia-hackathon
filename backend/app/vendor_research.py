"""Evidence-only vendor research. Selection is exclusively a user action."""
import hashlib
import json
from typing import Optional
from pydantic import Field, model_validator
from .models import Model

FACTS = ('availability_detail', 'stock_detail', 'pricing_detail', 'options_detail', 'conditions_detail')


class VendorEvidence(Model):
    content: str = Field(min_length=1, max_length=8000)
    availability_detail: Optional[str] = Field(default=None, max_length=2000)
    stock_detail: Optional[str] = Field(default=None, max_length=2000)
    pricing_detail: Optional[str] = Field(default=None, max_length=2000)
    options_detail: Optional[str] = Field(default=None, max_length=2000)
    conditions_detail: Optional[str] = Field(default=None, max_length=2000)

    @model_validator(mode='after')
    def exact_evidence(self):
        for key in FACTS:
            value = getattr(self, key)
            if value and value not in self.content:
                raise ValueError(f'{key} must be an exact excerpt from the vendor reply')
        return self


class EvidenceExtract(Model):
    availability_detail: Optional[str] = Field(default=None, max_length=2000)
    stock_detail: Optional[str] = Field(default=None, max_length=2000)
    pricing_detail: Optional[str] = Field(default=None, max_length=2000)
    options_detail: Optional[str] = Field(default=None, max_length=2000)
    conditions_detail: Optional[str] = Field(default=None, max_length=2000)


class Selection(Model):
    vendor_id: str
    response_id: str
    report_token: str = Field(min_length=64, max_length=64)
    chosen_date: str = Field(default='', max_length=100)
    chosen_option: str = Field(default='', max_length=1000)
    notes: str = Field(default='', max_length=2000)


class Enquiry(Model):
    requirements: str = Field(default='', max_length=2000)


def report(state, wedding):
    replies = state.get('vendor_evidence', [])
    token = hashlib.sha256(json.dumps({'revision':wedding['revision'], 'replies':replies, 'vendors':state['vendors']}, sort_keys=True).encode()).hexdigest()
    rows = []
    for vendor in state['vendors']:
        evidence = [r for r in replies if r['vendor_id'] == vendor['id']]
        current = [r for r in evidence if r['brief_revision'] == wedding['revision']]
        facts = {}
        for key in FACTS:
            fact = current[-1] if current and current[-1].get(key) else None
            facts[key] = {'text':fact[key], 'response_id':fact['id'], 'received_at':fact['created_at']} if fact else None
        rows.append(dict(vendor=vendor, facts=facts, responses=current,
            outdated_response_count=len(evidence)-len(current),
            missing=[key.replace('_detail','') for key in FACTS if not facts[key]],
            summary='; '.join(f"{key.replace('_detail','').capitalize()}: {facts[key]['text'] if facts[key] else 'Not provided'}" for key in FACTS)))
    decisions = [dict(d, needs_review=d['report_token'] != token) for d in state.get('user_selections', [])]
    return dict(report_token=token, vendors=rows, user_selections=decisions,
        note='Vendor statements are evidence, not verified availability or binding quotations. Rows retain directory order; no winner is chosen. Prices may have different scope, units, taxes and exclusions. The user chooses and handles booking, purchase confirmation and payment directly.')
