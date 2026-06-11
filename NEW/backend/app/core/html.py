"""Server-side HTML sanitization for user-authored document content.

Rich-text from the tiptap editor is stored and later re-rendered (in the browser
and into PDFs), so it must be sanitized on the way in to prevent stored XSS. nh3
(Rust/ammonia) is allow-list based and fast enough to run on every save.
"""
from __future__ import annotations

import nh3

# Tags a policy/procedure document legitimately needs — headings, lists, tables,
# emphasis, links. Everything else (script, style, iframe, event handlers) is stripped.
_ALLOWED_TAGS = {
    "p", "br", "hr", "span", "div",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "strike", "sub", "sup", "mark", "small", "code", "pre",
    "blockquote", "ul", "ol", "li",
    "a", "img",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
}
_ALLOWED_ATTRS = {
    # NOTE: do not list "rel" here — link_rel (below) manages it; nh3 panics if both set.
    "a": {"href", "title", "target"},
    "img": {"src", "alt", "title", "width", "height"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan", "scope"},
    "col": {"span"},
    "*": {"style", "class"},
}


def sanitize_html(html: str | None) -> str:
    if not html:
        return ""
    return nh3.clean(
        html,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRS,
        link_rel="noopener noreferrer nofollow",
    )
