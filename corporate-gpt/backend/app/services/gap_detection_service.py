"""
Knowledge Gap Detection Service — Custom Differentiator
Automatically detects knowledge gaps from unanswered queries, low-confidence responses,
and employee feedback. Triggers notifications when gaps are found.

This is core IP that differentiates CorporateGPT from generic RAG solutions.
"""
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_gap import KnowledgeGap
from app.models.feedback import Feedback
from app.models.analytics import AnalyticsEvent
from app.models.document import Document
from app.models.notification import Notification


class GapDetectionService:
    """Automated knowledge gap detection engine."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def analyze_and_detect(self, organization_id: str) -> Dict[str, Any]:
        """Run full gap detection pipeline."""
        gaps = []
        
        # 1. Detect from unanswered queries
        query_gaps = await self._detect_from_queries(organization_id)
        gaps.extend(query_gaps)
        
        # 2. Detect from low-confidence feedback
        feedback_gaps = await self._detect_from_feedback(organization_id)
        gaps.extend(feedback_gaps)
        
        # 3. Detect from missing documentation
        doc_gaps = await self._detect_missing_docs(organization_id)
        gaps.extend(doc_gaps)
        
        # 4. Detect conflicting information
        conflict_gaps = await self._detect_conflicts(organization_id)
        gaps.extend(conflict_gaps)
        
        # Create notifications for new gaps
        if gaps:
            await self._create_gap_notifications(organization_id, gaps)
        
        return {
            "total_gaps_detected": len(gaps),
            "gaps": gaps,
            "categories": {
                "unanswered_queries": len(query_gaps),
                "low_confidence": len(feedback_gaps),
                "missing_documentation": len(doc_gaps),
                "conflicting_information": len(conflict_gaps),
            },
        }
    
    async def _detect_from_queries(self, org_id: str) -> List[Dict[str, Any]]:
        """Detect gaps from unanswered or low-confidence queries."""
        # Find queries where the RAG system returned "not found"
        stmt = select(
            KnowledgeGap.title,
            KnowledgeGap.frequency,
            KnowledgeGap.department,
        ).where(
            KnowledgeGap.organization_id == org_id,
            KnowledgeGap.is_resolved == False,
            KnowledgeGap.frequency >= 3,  # Asked 3+ times = significant gap
        ).order_by(KnowledgeGap.frequency.desc()).limit(10)
        
        result = await self.db.execute(stmt)
        
        return [
            {
                "type": "unanswered_query",
                "query": row.title,
                "frequency": row.frequency,
                "department_id": row.department,
                "severity": "high" if row.frequency >= 10 else "medium",
            }
            for row in result.all()
        ]
    
    async def _detect_from_feedback(self, org_id: str) -> List[Dict[str, Any]]:
        """Detect gaps from negative feedback (thumbs down + comments)."""
        week_ago = datetime.utcnow() - timedelta(days=7)
        
        stmt = select(Feedback).where(
            Feedback.organization_id == org_id,
            Feedback.rating <= 2,  # Thumbs down or worse
            Feedback.created_at >= week_ago,
            Feedback.comment.isnot(None),
        ).limit(20)
        
        result = await self.db.execute(stmt)
        feedbacks = result.scalars().all()
        
        gaps = []
        for fb in feedbacks:
            # Group similar feedback comments
            gaps.append({
                "type": "low_confidence",
                "comment": fb.comment[:200] if fb.comment else "",
                "message_id": fb.message_id,
                "severity": "medium",
            })
        
        return gaps
    
    async def _detect_missing_docs(self, org_id: str) -> List[Dict[str, Any]]:
        """Detect missing documentation by analyzing knowledge gaps."""
        stmt = select(
            KnowledgeGap.department,
            func.count(KnowledgeGap.id).label("gap_count"),
        ).where(
            KnowledgeGap.organization_id == org_id,
            KnowledgeGap.is_resolved == False,
        ).group_by(KnowledgeGap.department).having(
            func.count(KnowledgeGap.id) >= 5
        ).order_by(func.count(KnowledgeGap.id).desc())
        
        result = await self.db.execute(stmt)
        
        return [
            {
                "type": "missing_documentation",
                "department_id": row.department,
                "gap_count": row.gap_count,
                "severity": "high" if row.gap_count >= 10 else "medium",
            }
            for row in result.all()
        ]
    
    async def _detect_conflicts(self, org_id: str) -> List[Dict[str, Any]]:
        """Detect conflicting information by finding documents on the same topic."""
        # Simple heuristic: documents with similar titles
        stmt = select(Document.title, func.count(Document.id)).where(
            Document.organization_id == org_id,
        ).group_by(Document.title).having(
            func.count(Document.id) >= 3
        ).limit(5)
        
        result = await self.db.execute(stmt)
        
        return [
            {
                "type": "conflicting_information",
                "topic": row.title,
                "document_count": row[1],
                "severity": "medium",
            }
            for row in result.all()
        ]
    
    async def _create_gap_notifications(
        self,
        org_id: str,
        gaps: List[Dict[str, Any]],
    ):
        """Create notifications for knowledge admins about new gaps."""
        high_severity = [g for g in gaps if g.get("severity") == "high"]
        if not high_severity:
            return
        
        # Create notification for admins
        # Use a reserved admin user ID or broadcast type
        # Use a placeholder user_id for org-wide notifications
        notification = Notification(
            user_id="",  # Will be routed to admins via notification_type
            notification_type="knowledge_gap",
            title=f"Knowledge Gaps Detected ({len(high_severity)} high priority)",
            message=(
                f"Auto-detected {len(gaps)} knowledge gaps "
                f"({len(high_severity)} high priority). "
                f"Review in the Knowledge Health dashboard."
            ),
        )
        self.db.add(notification)
        await self.db.flush()
