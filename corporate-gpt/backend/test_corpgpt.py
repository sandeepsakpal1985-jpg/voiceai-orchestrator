"""
CorporateGPT - End-to-End Test Script

Usage:
  1. Start the backend: cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000
  2. Run: python test_corpgpt.py

This script will:
  - Log in as admin
  - Upload a sample SOP document
  - Create a chat and ask about the SOP
  - Display the AI response with citations
"""

import asyncio
import httpx
import json
import os

BASE_URL = "http://localhost:8000/api/v1"

def color(text, code):
    return f"\033[{code}m{text}\033[0m"

def green(text):
    return color(text, "92")

def yellow(text):
    return color(text, "93")

def cyan(text):
    return color(text, "96")

def red(text):
    return color(text, "91")


async def login():
    """Log in and get tokens."""
    print(yellow("\n=== STEP 1: Login ==="))
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BASE_URL}/auth/login",
            data={"username": "admin@corpgpt.com", "password": "Admin123!"},
        )
        if resp.status_code == 200:
            data = resp.json()
            print(green(f"  Login successful!"))
            print(f"  Access token: {data.get('access_token', 'N/A')[:30]}...")
            return data.get("access_token", ""), data.get("refresh_token", "")
        else:
            print(red(f"  Login failed: {resp.status_code}"))
            print(f"  Response: {resp.text[:200]}")
            return None, None


async def upload_document(token: str):
    """Upload a sample SOP document."""
    print(yellow("\n=== STEP 2: Upload Sample SOP Document ==="))
    
    # Create a sample SOP document if it doesn't exist
    sop_path = "sample_sop.md"
    if not os.path.exists(sop_path):
        with open(sop_path, "w", encoding="utf-8") as f:
            f.write("""# Standard Operating Procedure: Customer Onboarding

## Version 1.0

## 1. Purpose
This SOP outlines the process for onboarding new customers to the CorporateGPT platform.

## 2. Scope
This procedure applies to all Sales and Customer Success team members.

## 3. Prerequisites
- Customer has signed the service agreement
- Customer has completed payment
- Admin has created the customer organization

## 4. Procedure

### 4.1 Create Organization
1. Log in to the admin dashboard
2. Navigate to Organizations > Create New
3. Enter company name, domain, and admin email
4. Click Submit

### 4.2 Configure User Roles
1. Go to Settings > Roles & Permissions
2. Assign the following roles:
   - Company Admin: Full company access
   - Department Admin: Department-level access
   - Employee: Basic access
3. Customize permissions as needed

### 4.3 Upload Knowledge Base
1. Navigate to Documents > Upload
2. Select company SOPs, policies, and training materials
3. Supported formats: PDF, DOCX, TXT, MD
4. Wait for indexing to complete

### 4.4 Invite Users
1. Go to Users > Invite
2. Enter email addresses (comma-separated)
3. Select role for each user
4. Click Send Invitations

### 4.5 Verify Access
1. Log in as a test user
2. Verify document access permissions
3. Test the AI chat with sample questions
4. Confirm all features work correctly

## 5. Troubleshooting

### Login Issues
- Reset password using the "Forgot Password" link
- Check email for verification link
- Contact admin if account is locked

### Document Not Found
- Ensure documents are uploaded to the correct department
- Check document indexing status
- Re-upload if necessary

### AI Not Responding
- Verify AI service is running
- Check network connectivity
- Contact support for API issues

## 6. Contact
For assistance, contact:
- IT Support: support@corpgpt.com
- Customer Success: cs@corpgpt.com
""")
        print(f"  Created sample SOP file: {sop_path}")
    
    async with httpx.AsyncClient() as client:
        with open(sop_path, "rb") as f:
            files = {"file": ("sample_sop.md", f, "text/markdown")}
            resp = await client.post(
                f"{BASE_URL}/documents/upload",
                headers={"Authorization": f"Bearer {token}"},
                files=files,
                data={
                    "category": "SOP",
                    "tags": "onboarding,sop,customer,procedure",
                    "confidentiality": "internal",
                },
            )
        
        if resp.status_code in (200, 201):
            data = resp.json()
            print(green(f"  Document uploaded successfully!"))
            print(f"  Document ID: {data.get('id', 'N/A')}")
            print(f"  Filename: {data.get('filename', 'N/A')}")
            print(f"  Chunks: {data.get('chunk_count', 0)}")
            print(f"  Indexed: {data.get('is_indexed', False)}")
            return data.get("id", "")
        else:
            print(red(f"  Upload failed: {resp.status_code}"))
            print(f"  Response: {resp.text[:500]}")
            return None


async def search_document(token: str, query: str):
    """Search for documents."""
    print(yellow("\n=== STEP 3: Search Documents ==="))
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/search",
            headers={"Authorization": f"Bearer {token}"},
            params={"q": query},
        )
        if resp.status_code == 200:
            data = resp.json()
            print(green(f"  Search successful!"))
            print(f"  Query: '{query}'")
            print(f"  Total results: {data.get('total', 0)}")
            for i, result in enumerate(data.get("semantic_results", data.get("results", []))[:3]):
                print(f"  \n  Result {i+1}:")
                print(f"    Title: {result.get('title', result.get('filename', 'N/A'))}")
                print(f"    Score: {result.get('score', result.get('similarity', 'N/A'))}")
                print(f"    Snippet: {str(result.get('text', result.get('snippet', '')))[:100]}...")
            return data
        else:
            print(red(f"  Search failed: {resp.status_code}"))
            print(f"  Response: {resp.text[:300]}")
            return None


async def chat_query(token: str, message: str):
    """Send a chat message and get AI response."""
    print(yellow("\n=== STEP 4: Chat with AI ==="))
    
    # First create a chat session
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BASE_URL}/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"title": "Test SOP Query"},
        )
        if resp.status_code not in (200, 201):
            print(red(f"  Chat creation failed: {resp.status_code}"))
            print(f"  Response: {resp.text[:200]}")
            return None
        
        chat_data = resp.json()
        chat_id = chat_data.get("id", "")
        print(f"  Chat session created: {chat_id[:8]}...")
        
        # Send message
        resp = await client.post(
            f"{BASE_URL}/chat/{chat_id}/messages",
            headers={"Authorization": f"Bearer {token}"},
            json={"content": message, "role": "user"},
        )
        
        if resp.status_code == 200:
            data = resp.json()
            ai_response = data.get("content", data.get("response", ""))
            print(green(f"  AI Response:"))
            print(f"  {cyan('---')}")
            print(f"  {ai_response}")
            print(f"  {cyan('---')}")
            
            # Show citations if available
            citations = data.get("citations", data.get("sources", []))
            if citations:
                print(f"\n  {yellow('Citations:')}")
                for i, c in enumerate(citations[:3]):
                    print(f"    {i+1}. {c.get('title', c.get('filename', 'Source'))}")
                    print(f"       Score: {c.get('score', c.get('confidence', 'N/A'))}")
            
            return data
        else:
            print(red(f"  Chat failed: {resp.status_code}"))
            print(f"  Response: {resp.text[:500]}")
            return None


async def stream_chat(token: str, message: str):
    """Send a chat message with streaming response."""
    print(yellow("\n=== STEP 5: Streaming Chat ==="))
