# Chatalog Search

**Version:** 1.0  
**Status:** Active  
**Effective date:** 2026-01-21

This document describes **how search works in Chatalog**, from a user’s perspective.  
It is intentionally written as a **behavioral contract**, not an implementation guide.

Search may evolve, but the guarantees described here are designed to remain stable.

---

## What Search Is

Search in Chatalog is a unified way to **find, browse, and rediscover your personal knowledge**, including:

- Notes
- Chats / conversations
- Recipes
- Structured and semi-structured metadata

Search supports:
- Quick recall
- Browsing without a query
- Contextual navigation
- Gradual discovery

---

## The Search Field

Chatalog opens with a single search field.

- You can type **natural language**
- No special syntax is required
- Queries can be short or descriptive

Examples:
chicken lemon
Portugal itinerary
NYT meatloaf
fennel apple salad

yaml
Copy code

---

## Empty Search (Browsing)

### What happens if you search with no text?

If the search field is empty and you initiate a search:

> Chatalog behaves as if  searched for **everything** within the current scope.

This allows you to:
- Browse content without inventing keywords
- Apply scopes or filters first
- Resume exploration quickly

Empty search is **valid and intentional**.

---

## Search Scope

Search always runs within a **scope**, such as:
- All content
- Recipes only
- Notes only
- Chats only

### Scope behavior
- The last selected scope is remembered
- You do not need to reselect scope every time
- Empty search respects the current scope

---

## How Queries Are Interpreted

Chatalog interprets what you type rather than matching raw text.

### Tokenization
- Removes numbers, units, and filler words
- Preserves meaningful words
- Preserves important phrases

Example:
"1 tsp freshly ground black pepper"

vbnet
Copy code

Is treated as:
pepper
black pepper

yaml
Copy code

This makes search forgiving and aligned with how people think.

---

## Matching Behavior

### General matching
- Each meaningful word or phrase is searched independently
- Content that matches is included in results
- Matching can occur in titles, body text, or structured fields

### Recipe-specific matching
For recipes:
- Ingredients are first-class search targets
- Phrase matches (e.g. *black pepper*) are stronger than partial matches
- Units and preparation words do not affect results

Searching:
olive oil lemon chicken

yaml
Copy code
Finds recipes that meaningfully include those ingredients, even if other ingredients are present.

---

## Result Grouping

Search results are **grouped**, not flat.

Results are organized by meaningful containers such as:
- Projects
- Chats
- Recipes
- Topics

Think of it as:
> “Here is the thing, and inside it are the matching parts.”

Grouping provides:
- Context
- Cleaner navigation
- Fewer noisy duplicates

---

## Ordering & Stability

Search results are ordered in a **deterministic** way.

### Guarantees
- The same search under the same conditions produces the same ordering
- Results do not reshuffle unpredictably

### What may influence ordering
- Match strength
- Phrase vs single-word matches
- Recency

Exact scoring formulas are internal and may change, but **ordering stability is guaranteed**.

---

## What Search Does Not Do (Yet)

Some features are intentionally not part of the current guarantees.

### No explainability (yet)
- Search does not currently explain *why* a result matched
- There is no visible token or score breakdown

### No relation expansion (yet)
- Only direct matches are returned
- Related notes are not automatically included

### No semantic-only matches required
- Exact and token-based matching dominates
- Meaning-based matching is additive, not replacing

---

## Mental Model

A useful way to think about Chatalog search:

> **Start precise, then expand outward.**

Exact matches come first.  
Context and grouping follow.  
More advanced intelligence is layered on intentionally.

---

## Future Enhancements (Non-Binding)

The following behaviors are planned, but not guaranteed in v1.0:

### Explainable results
- Optional “Why this result?” views
- Human-readable explanations
- No raw scores by default

### Recipe-specific ranking
- Boosts for recipes you’ve cooked
- Consideration of ratings and frequency
- Stronger ingredient phrase matching

### Relation-aware expansion
- Optional inclusion of related notes
- Clear labeling of expanded results
- User control over expansion

### Semantic & hybrid search
- Meaning-based discovery using embeddings
- Hybrid ranking that never hides exact matches

---

## Stability Guarantees

Search in Chatalog is designed to be:

- **Stable** — behavior does not change unexpectedly
- **Forgiving** — no perfect syntax required
- **Grouped** — results always have context
- **Evolvable** — new power without breaking trust

If behavior changes, it should:
- Improve relevance
- Preserve intuition
- Be explainable

---

## Versioning

This document is versioned.

- Minor versions (1.x) add features without breaking guarantees
- Major versions (2.0) explicitly revise behavior

### Change log
v1.0 – Initial public Search contract
• Defined empty search semantics
• Formalized grouping and stability guarantees
• Established boundaries for future enhancements

yaml
Copy code

---

## Summary

You can use Chatalog search to:
- Type naturally
- Browse without keywords
- Rely on consistent behavior
- Navigate by context, not just hits

Search grows more powerful over time—but never more fragile.
