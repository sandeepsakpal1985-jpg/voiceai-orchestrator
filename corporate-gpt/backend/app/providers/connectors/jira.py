"""
Jira Connector — atlassian-python-api wrapper
Syncs issues and documentation from Jira projects into the knowledge base.

Library: atlassian-python-api
"""
from typing import Any, Dict, List, Optional


class JiraConnector:
    """Thin wrapper around atlassian-python-api for Jira integration."""

    def __init__(self, url: str, username: str, api_token: str):
        self.url = url
        self.username = username
        self.api_token = api_token
        self._client = None

    @property
    def client(self):
        """Lazy-initialized Jira client."""
        if self._client is None:
            from atlassian import Jira
            self._client = Jira(
                url=self.url,
                username=self.username,
                password=self.api_token,
            )
        return self._client

    def test_connection(self) -> bool:
        """Test the connection to Jira."""
        try:
            self.client.get_projects(limit=1)
            return True
        except Exception as e:
            print(f"Jira connection failed: {e}")
            return False

    def list_projects(self) -> List[Dict[str, Any]]:
        """List all accessible projects."""
        projects = self.client.get_all_projects(included_archived=False)
        return [
            {
                "key": p.get("key", ""),
                "name": p.get("name", ""),
                "description": p.get("description", ""),
                "project_type_key": p.get("projectTypeKey", ""),
            }
            for p in (projects or [])
        ]

    def get_project_issues(
        self,
        project_key: str,
        jql: Optional[str] = None,
        limit: int = 100,
        fields: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Get issues from a Jira project with optional JQL filter.

        Args:
            project_key: Jira project key (e.g. 'KNOW', 'HR')
            jql: Optional additional JQL filter (e.g. 'issuetype in (Epic, Story)')
            limit: Max issues per page
            fields: Fields to fetch (default: summary, description, status, assignee)

        Returns:
            List of issue dicts with key, summary, description, status, etc.
        """
        if fields is None:
            fields = ["summary", "description", "status", "assignee", "issuetype", "labels", "priority", "created", "updated"]

        base_jql = f"project = {project_key}"
        if jql:
            base_jql = f"{base_jql} AND {jql}"

        all_issues = []
        start_at = 0

        while True:
            results = self.client.jql(
                base_jql,
                start=start_at,
                limit=limit,
                fields=",".join(fields),
            )
            issues = results.get("issues", [])
            if not issues:
                break

            for issue in issues:
                issue_data = {
                    "id": issue.get("id", ""),
                    "key": issue.get("key", ""),
                    "self": issue.get("self", ""),
                    "project_key": project_key,
                }

                fields_data = issue.get("fields", {})
                issue_data["summary"] = fields_data.get("summary", "")
                issue_data["description"] = fields_data.get("description", "")
                issue_data["status"] = fields_data.get("status", {}).get("name", "") if fields_data.get("status") else ""
                issue_data["issue_type"] = fields_data.get("issuetype", {}).get("name", "") if fields_data.get("issuetype") else ""
                issue_data["priority"] = fields_data.get("priority", {}).get("name", "") if fields_data.get("priority") else ""
                issue_data["labels"] = fields_data.get("labels", [])
                issue_data["assignee"] = fields_data.get("assignee", {}).get("displayName", "") if fields_data.get("assignee") else ""
                issue_data["created"] = fields_data.get("created", "")
                issue_data["updated"] = fields_data.get("updated", "")

                all_issues.append(issue_data)

            start_at += limit

        return all_issues

    def sync_project(
        self,
        project_key: str,
        callback=None,
    ) -> List[Dict[str, Any]]:
        """Sync all issues from a project. Calls callback(issue_data) for each issue.

        Args:
            project_key: Jira project key
            callback: Optional function to call with each issue's data

        Returns:
            List of synced issue data dicts
        """
        issues = self.get_project_issues(project_key)
        synced = []

        for issue in issues:
            # Build a text representation from issue fields
            content_parts = [
                f"Title: {issue['summary']}",
                f"Status: {issue['status']}",
                f"Type: {issue['issue_type']}",
                f"Priority: {issue['priority']}",
                f"Labels: {', '.join(issue['labels'])}",
                f"Assignee: {issue['assignee']}",
            ]
            if issue.get("description"):
                # Strip HTML tags from description
                import re
                desc = re.sub(r"<[^>]+>", "", issue["description"])
                content_parts.append(f"Description: {desc}")

            content = "\n".join(content_parts)

            issue_data = {
                "external_id": issue["key"],
                "title": f"[{issue['key']}] {issue['summary']}",
                "content": content,
                "url": f"{self.url}/browse/{issue['key']}",
                "project_key": project_key,
                "issue_type": issue["issue_type"],
                "status": issue["status"],
                "priority": issue["priority"],
                "labels": issue["labels"],
                "source": "jira",
            }

            if callback:
                callback(issue_data)

            synced.append(issue_data)

        return synced
