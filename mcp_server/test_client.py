"""
MCP smoke test — exercises the Hotshot server exactly as Claude Desktop does.

Launches server.py as a subprocess over stdio, runs the MCP handshake, lists the
tools, and calls a few of them. If this passes, Claude Desktop will work too.

Run:  ../backend/.venv/bin/python test_client.py
"""
import asyncio
import json
import os
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

_HERE   = os.path.dirname(os.path.abspath(__file__))
_PYTHON = sys.executable
_SERVER = os.path.join(_HERE, "server.py")


def _show(title: str, result) -> None:
    """Pretty-print a tool result (FastMCP returns JSON text content)."""
    print(f"\n=== {title} ===")
    for block in result.content:
        text = getattr(block, "text", None)
        if text is None:
            continue
        try:
            print(json.dumps(json.loads(text), indent=2, default=str)[:1400])
        except json.JSONDecodeError:
            print(text[:1400])


async def main() -> None:
    params = StdioServerParameters(command=_PYTHON, args=[_SERVER])

    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            print("MCP handshake OK — connected to the Hotshot server.")

            tools = await session.list_tools()
            print(f"\n{len(tools.tools)} tools advertised:")
            for t in tools.tools:
                print(f"  - {t.name}")

            _show(
                "list_active_incidents(state=CA, limit=3)",
                await session.call_tool("list_active_incidents",
                                         {"state": "CA", "limit": 3}),
            )
            _show(
                "situational_summary(state=CA)",
                await session.call_tool("situational_summary", {"state": "CA"}),
            )
            _show(
                "draft_ics209(incident='Santa Rosa Island')",
                await session.call_tool("draft_ics209",
                                         {"incident": "Santa Rosa Island"}),
            )

    print("\nAll calls completed — the server is ready for Claude Desktop.")


if __name__ == "__main__":
    asyncio.run(main())
