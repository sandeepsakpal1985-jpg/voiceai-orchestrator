"""Knowledge health analysis service."""
from typing import List, Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.knowledge_gap import KnowledgeGap


async def analyze_knowledge_health(org_id: str, db: AsyncSession) -> dict:
    result = await db.execute(select(func.count()).select_from(KnowledgeGap)
                              .where(KnowledgeGap.organization_id == org_id, KnowledgeGap.is_resolved == False))
    unresolved = result.scalar() or 0

    result = await db.execute(select(KnowledgeGap.gap_type, func.count())
                              .where(KnowledgeGap.organization_id == org_id, KnowledgeGap.is_resolved == False)
                              .group_by(KnowledgeGap.gap_type))
    gaps_by_type = {row[0]: row[1] for row in result.all()}

    result = await db.execute(select(KnowledgeGap.severity, func.count())
                              .where(KnowledgeGap.organization_id == org_id, KnowledgeGap.is_resolved == False)
                              .group_by(KnowledgeGap.severity))
    gaps_by_severity = {row[0]: row[1] for row in result.all()}

    total_gaps = sum(gaps_by_type.values()) if gaps_by_type else 0
    health_score = max(0, 100 - total_gaps * 5)

    return {
        "health_score": health_score,
        "total_gaps": total_gaps,
        "unresolved_count": unresolved,
        "gaps_by_type": gaps_by_type,
        "gaps_by_severity": gaps_by_severity,
        "recommendations": _generate_recommendations(gaps_by_type),
    }


def _generate_recommendations(gaps: dict) -> List[str]:
    recs = []
    if gaps.get("missing_doc", 0) > 0:
        recs.append(f"Upload documents for {gaps['missing_doc']} missing topics")
    if gaps.get("outdated", 0) > 0:
        recs.append(f"Review {gaps['outdated']} outdated documents that need updates")
    if gaps.get("conflicting", 0) > 0:
        recs.append(f"Resolve {gaps['conflicting']} conflicting document pairs")
    if gaps.get("low_confidence", 0) > 3:
        recs.append("Improve document quality - several queries have low confidence responses")
    return recs
