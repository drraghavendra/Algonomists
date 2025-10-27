import aiohttp
import json
from typing import Dict, Any, Optional
import os

class GeminiClient:
    def __init__(self):
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        self.api_key = os.getenv("GEMINI_API_KEY")
    
    async def verify_website_ownership(self, domain: str, verification_header: str) -> bool:
        """Verify website ownership via header response"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"https://{domain}", headers={
                    "User-Agent": "AgentWeb-Verification/1.0"
                }) as response:
                    headers = response.headers
                    actual_header = headers.get('X-AgentWeb-Verification')
                    
                    return actual_header == verification_header
                    
        except Exception as e:
            print(f"Error verifying ownership: {e}")
            return False
    
    async def process_agent_query(self, website_url: str, query_type: str, 
                                parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Process agent query using Gemini AI"""
        try:
            # First, fetch website content
            async with aiohttp.ClientSession() as session:
                async with session.get(website_url) as response:
                    content = await response.text()
            
            # Use Gemini to process the query
            prompt = self._build_agent_prompt(query_type, parameters, content)
            
            gemini_response = await self._call_gemini_api(prompt)
            
            return {
                "processed_data": gemini_response,
                "source_url": website_url,
                "query_type": query_type,
                "timestamp": "2024-01-01T00:00:00Z"  # In production, use actual timestamp
            }
            
        except Exception as e:
            print(f"Error processing agent query: {e}")
            return {"error": str(e)}
    
    def _build_agent_prompt(self, query_type: str, parameters: Dict[str, Any], content: str) -> str:
        """Build prompt for Gemini based on query type"""
        base_prompt = f"""
        You are an AI agent processing web content for specific queries.
        
        Query Type: {query_type}
        Parameters: {json.dumps(parameters)}
        
        Website Content:
        {content[:4000]}  # Limit content length
        
        Please extract and structure the relevant information based on the query type and parameters.
        Return only the structured data in JSON format.
        """
        
        return base_prompt
    
    async def _call_gemini_api(self, prompt: str) -> Dict[str, Any]:
        """Call Gemini API for content processing"""
        if not self.api_key:
            # Return mock response for demo
            return {
                "extracted_data": "Mock extracted data from website content",
                "summary": "This is a mock response from Gemini AI",
                "structured_format": {"field1": "value1", "field2": "value2"}
            }
        
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.base_url}/models/gemini-pro:generateContent?key={self.api_key}"
                
                payload = {
                    "contents": [{
                        "parts": [{"text": prompt}]
                    }]
                }
                
                async with session.post(url, json=payload) as response:
                    result = await response.json()
                    
                    if response.status == 200:
                        return self._parse_gemini_response(result)
                    else:
                        return {"error": "Gemini API call failed"}
                        
        except Exception as e:
            print(f"Error calling Gemini API: {e}")
            return {"error": str(e)}
    
    def _parse_gemini_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Parse Gemini API response"""
        try:
            text_content = response['candidates'][0]['content']['parts'][0]['text']
            # Try to parse as JSON, otherwise return as text
            try:
                return json.loads(text_content)
            except json.JSONDecodeError:
                return {"raw_response": text_content}
        except (KeyError, IndexError):
            return {"error": "Invalid response format from Gemini"}