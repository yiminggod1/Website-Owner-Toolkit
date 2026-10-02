# Website Owner Toolkit

Practical, browser-first website diagnostics, focused checkers, fixers, generators, and field guides for people who own or maintain websites.

Product loop: **Check → Explain → Fix → Generate**

## What is included

- **Website Audit** with a pasted-HTML fallback for pages that block browser cross-origin reads
- **30 focused tools** across SEO, search appearance, technical checks, growth utilities, and content helpers
- **5 field guides** covering website audits, technical SEO, structured data, campaign tracking, and DNS/email authentication
- **Methodology & Sources** explaining how checks work, what they can prove, and what still requires deeper testing
- Browser-first processing for many tools, with DNS-over-HTTPS requests where a resolver is required
- Reserved, non-overlapping advertisement areas for future monetization

## Product approach

The toolkit is deliberately built around concrete website-owner jobs rather than an oversized dashboard. A typical path is:

**Find a problem → understand it → open the focused fixer → re-check**

The Website Audit is the main entry point, while the individual tools target specific tasks such as meta titles, descriptions, canonicals, headings, image alt text, Open Graph, sitemaps, robots.txt, structured data, DNS, redirects, UTM parameters, and more.

## Design

The visual direction is intentionally editorial and utility-focused rather than the repeated “AI SaaS” card aesthetic: warm paper tones, ink typography, thin rules, serif display type, restrained accents, asymmetric composition, and varied card treatments.

## Limitations

This is a static browser-first implementation. Browser cross-origin policy can prevent a page from being fetched directly. The audit therefore provides a pasted-source fallback rather than bypassing browser security.

Some tasks require server-side crawling, authenticated testing, real redirect-chain inspection, complete network tracing, specialized accessibility evaluation, or human review. Tool results are diagnostic aids, not certificates or ranking guarantees.

## Search and content

The site includes distinct explanatory content on every focused tool page plus field guides that connect related topics and tools. The aim is to help a visitor complete a real website job rather than publish thin pages built only around keyword variations.

## Open-source research

Research references include mature projects such as Trivium, Tanaguru, CrawlScope, and focused meta-tag/accessibility tools. This repository implements its own frontend logic and explanations rather than copying upstream code.

## License

The repository currently has no explicit open-source license. Unless a license is added, default copyright rules apply to this repository's original content and code.
