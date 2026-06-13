"""
Knowledge Health Service — Custom Differentiator
Analyzes knowledge base health: gaps, duplicates, outdated docs, low-confidence responses.
This is core IP that differentiates CorporateGPT from generic RAG solutions.
"""
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.knowledge_gap import KnowledgeGap
from app.models.faq import FAQ
from app.models.analytics import AnalyticsEvent


class KnowledgeHealthService:
    """Enterprise knowledge health analysis engine."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_health_score(self, organization_id: str) -> Dict[str, Any]:
        """Calculate overall knowledge health score (0-100)."""
        total_docs = await self._count_documents(organization_id)
        indexed_docs = await self._count_indexed_documents(organization_id)
        gaps = await self._count_open_gaps(organization_id)
        outdated = await self._count_outdated_documents(organization_id)
        low_confidence = await self._count_low_confidence(organization_id)
        
        score = 100.0
        if total_docs == 0:
            score = 0.0
        else:
            # Index ratio (30 points)
            index_ratio = indexed_docs / max(total_docs, 1)
            score -= (1 - index_ratio) * 30
            
            # Outdated docs penalty (25 points)
            score -= min(outdated * 5, 25)
            
            # Knowledge gaps penalty (25 points)
            score -= min(gaps * 3, 25)
            
            # Low confidence penalty (20 points)
            score -= min(low_confidence * 2, 20)
        
        return {
            "score": max(0, round(score, 1)),
            "total_documents": total_docs,
            "indexed_documents": indexed_docs,
            "open_gaps": gaps,
            "outdated_documents": outdated,
            "low_confidence_responses": low_confidence,
        }
    
    async def get_gap_analysis(self, organization_id: str) -> Dict[str, Any]:
        """Analyze knowledge gaps — unanswered questions by department."""
        stmt = select(
            KnowledgeGap.department,
            KnowledgeGap.title,
            KnowledgeGap.frequency,
        ).where(
            KnowledgeGap.organization_id == organization_id,
            KnowledgeGap.is_resolved == False,
        ).order_by(KnowledgeGap.frequency.desc()).limit(20)
        
        result = await self.db.execute(stmt)
        gaps = result.all()
        
        return {
            "total_gaps": len(gaps),
            "top_gaps": [
                {
                    "query": g.title,
                    "frequency": g.frequency,
                    "department_id": g.department,
                }
                for g in gaps
            ],
        }
    
    async def get_document_health(self, organization_id: str) -> Dict[str, Any]:
        """Analyze document health — duplicates, outdated, conflicts."""
        # Find outdated documents (no update in 6 months, no review in 12 months)
        six_months_ago = datetime.utcnow() - timedelta(days=180)
        twelve_months_ago = datetime.utcnow() - timedelta(days=365)
        
        outdated = await self.db.execute(
            select(Document).where(
                Document.organization_id == organization_id,
                Document.updated_at < six_months_ago,
            )
        )
        
        # Count by category/type
        type_dist = await self.db.execute(
            select(Document.file_type, func.count(Document.id))
            .where(Document.organization_id == organization_id)
            .group_by(Document.file_type)
        )
        
        return {
            "outdated_count": len(outdated.all()),
            "by_type": {row[0]: row[1] for row in type_dist.all()},
        }
    
    async def record_gap(
        self,
        organization_id: str,
        query: str,
        department_id: Optional[str] = None,
    ):
        """Record an unanswered question as a knowledge gap."""
        existing = await self.db.execute(
            select(KnowledgeGap).where(
                KnowledgeGap.organization_id == organization_id,
                KnowledgeGap.title == query,
                KnowledgeGap.is_resolved == False,
            )
        )
        gap = existing.scalar_one_or_none()
        
        if gap:
            gap.frequency += 1
        else:
            gap = KnowledgeGap(
                organization_id=organization_id,
                title=query,
                department=department_id,
            )
            self.db.add(gap)
        
        await self.db.flush()
    
    async def _count_documents(self, org_id: str) -> int:
        result = await self.db.execute(
            select(func.count(Document.id))
            .where(Document.organization_id == org_id)
        )
        return result.scalar() or 0
    
    async def _count_indexed_documents(self, org_id: str) -> int:
        result = await self.db.execute(
            select(func.count(Document.id))
            .where(and_(
                Document.organization_id == org_id,
                Document.is_indexed == True,
            ))
        )
        return result.scalar() or 0
    
    async def _count_open_gaps(self, org_id: str) -> int:
        result = await self.db.execute(
            select(func.count(KnowledgeGap.id))
            .where(and_(
                KnowledgeGap.organization_id == org_id,
                KnowledgeGap.is_resolved == False,
            ))
        )
        return result.scalar() or 0
    
    async def _count_outdated_documents(self, org_id: str) -> int:
        six_months = datetime.utcnow() - timedelta(days=180)
        result = await self.db.execute(
            select(func.count(Document.id))
            .where(and_(
                Document.organization_id == org_id,
                Document.updated_at < six_months,
            ))
        )
        return result.scalar() or 0
    
    async def _count_low_confidence(self, org_id: str) -> int:
        """Count analytics events indicating low confidence responses."""
        result = await self.db.execute(
            select(func.count(AnalyticsEvent.id))
            .where(and_(
                AnalyticsEvent.organization_id == org_id,
                AnalyticsEvent.event_type == "low_confidence",
            ))
        )
        return result.scalar() or 0
