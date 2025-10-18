/**
 * DOM Sampler - Extracts and cleans HTML samples for selector discovery
 * Uses heuristics to find post-like elements and prepares them for LLM analysis
 */

import { EXTENSION_NAME } from '@/shared/constants';

interface SamplingOptions {
  maxElements?: number;      // Maximum elements to sample (default: 15)
  minTextLength?: number;    // Minimum text length to consider element a post (default: 50)
  maxSampleSize?: number;    // Maximum HTML size in characters (default: 8000)
}

/**
 * Extract a cleaned HTML sample from the current page
 * Finds post-like elements using heuristics and cleans the HTML for LLM analysis
 */
export function sampleDOM(options: SamplingOptions = {}): string | null {
  const {
    maxElements = 15,
    minTextLength = 50,
    maxSampleSize = 8000,
  } = options;

  console.info(`${EXTENSION_NAME}: Sampling DOM for selector discovery...`);

  // Step 1: Find candidate elements using heuristics
  const candidates = findCandidateElements(minTextLength);

  if (candidates.length === 0) {
    console.warn(`${EXTENSION_NAME}: No candidate elements found for sampling`);
    return null;
  }

  console.info(`${EXTENSION_NAME}: Found ${candidates.length} candidate elements`);

  // Step 2: Take first N elements
  const sampled = candidates.slice(0, maxElements);

  // Step 3: Clean and serialize HTML
  const cleanedHTML = sampled.map(el => cleanElement(el)).join('\n\n');

  // Step 4: Truncate if too large
  let finalHTML = cleanedHTML;
  if (finalHTML.length > maxSampleSize) {
    console.warn(
      `${EXTENSION_NAME}: Sample too large (${finalHTML.length} chars), truncating to ${maxSampleSize}`
    );
    // Try with fewer elements
    const reducedSample = sampled.slice(0, Math.floor(maxElements / 2));
    finalHTML = reducedSample.map(el => cleanElement(el)).join('\n\n');

    if (finalHTML.length > maxSampleSize) {
      // Still too large, hard truncate
      finalHTML = finalHTML.substring(0, maxSampleSize) + '\n<!-- truncated -->';
    }
  }

  console.info(
    `${EXTENSION_NAME}: Generated HTML sample (${finalHTML.length} chars, ${sampled.length} elements)`
  );

  return finalHTML;
}

/**
 * Find candidate elements that look like posts/articles using heuristics
 */
function findCandidateElements(minTextLength: number): Element[] {
  const candidates: Element[] = [];
  const seen = new Set<Element>();

  // Heuristic 1: Elements with role="article"
  document.querySelectorAll('[role="article"]').forEach((el) => {
    if (!seen.has(el)) {
      candidates.push(el);
      seen.add(el);
    }
  });

  // Heuristic 2: <article> tags
  document.querySelectorAll('article').forEach((el) => {
    if (!seen.has(el)) {
      candidates.push(el);
      seen.add(el);
    }
  });

  // Heuristic 3: Main content area
  const mainElements = document.querySelectorAll('main, [role="main"]');
  mainElements.forEach((main) => {
    // Look for repeated children that might be posts
    const children = Array.from(main.children);
    const repeatedTagNames = findRepeatedTagNames(children);

    repeatedTagNames.forEach((tagName) => {
      const elements = main.querySelectorAll(`:scope > ${tagName}`);
      elements.forEach((el) => {
        if (!seen.has(el) && getTextContent(el).length >= minTextLength) {
          candidates.push(el);
          seen.add(el);
        }
      });
    });
  });

  // Heuristic 4: Common class name patterns
  const commonPatterns = [
    '[class*="post"]',
    '[class*="feed-item"]',
    '[class*="entry"]',
    '[class*="card"]',
    '[class*="item"]',
    '[data-testid*="post"]',
    '[data-testid*="tweet"]',
    '[data-testid*="item"]',
  ];

  commonPatterns.forEach((pattern) => {
    try {
      document.querySelectorAll(pattern).forEach((el) => {
        if (!seen.has(el) && getTextContent(el).length >= minTextLength) {
          candidates.push(el);
          seen.add(el);
        }
      });
    } catch (e) {
      // Invalid selector, skip
    }
  });

  // Heuristic 5: Elements with substantial text content
  // Look through divs that have enough text
  document.querySelectorAll('div').forEach((div) => {
    if (seen.has(div)) return;

    const text = getTextContent(div);
    if (text.length >= minTextLength && text.length <= 2000) {
      // Not too large (avoid containers)
      // Check if it has minimal children (likely a content element)
      const childDivs = div.querySelectorAll(':scope > div').length;
      if (childDivs <= 5) {
        // Simple structure
        candidates.push(div);
        seen.add(div);
      }
    }
  });

  return candidates;
}

/**
 * Find tag names that appear multiple times (likely repeated post elements)
 */
function findRepeatedTagNames(elements: Element[]): string[] {
  const tagCounts = new Map<string, number>();

  elements.forEach((el) => {
    const tag = el.tagName.toLowerCase();
    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  });

  // Return tags that appear 3+ times (likely repeated structure)
  return Array.from(tagCounts.entries())
    .filter(([, count]) => count >= 3)
    .map(([tag]) => tag);
}

/**
 * Get text content from element (excluding script/style)
 */
function getTextContent(element: Element): string {
  const clone = element.cloneNode(true) as Element;

  // Remove script and style elements
  clone.querySelectorAll('script, style').forEach((el) => el.remove());

  return clone.textContent?.trim() || '';
}

/**
 * Clean an element's HTML for LLM analysis
 * Removes: scripts, styles, inline styles, SVGs, comments, excessive attributes
 */
function cleanElement(element: Element): string {
  // Clone to avoid modifying the actual DOM
  const clone = element.cloneNode(true) as Element;

  // Remove unwanted elements
  clone.querySelectorAll('script, style, svg, noscript').forEach((el) => el.remove());

  // Remove comments
  const removeComments = (node: Node): void => {
    const childNodes = Array.from(node.childNodes);
    childNodes.forEach((child) => {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        removeComments(child);
      }
    });
  };
  removeComments(clone);

  // Clean attributes
  cleanAttributes(clone);

  // Serialize to HTML
  const serializer = new XMLSerializer();
  let html = serializer.serializeToString(clone);

  // Remove inline styles (they bloat the HTML)
  html = html.replace(/\s*style="[^"]*"/g, '');

  // Normalize whitespace
  html = html.replace(/\s+/g, ' ').trim();

  return html;
}

/**
 * Clean element attributes - keep only important ones
 */
function cleanAttributes(element: Element): void {
  // Attributes to keep (useful for selector discovery)
  const keepAttributes = new Set([
    'class',
    'id',
    'role',
    'data-testid',
    'data-test',
    'data-component',
    'aria-label',
    'aria-labelledby',
    'itemprop',
    'itemtype',
  ]);

  // Process this element
  if (element.attributes) {
    const toRemove: string[] = [];
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      if (!keepAttributes.has(attr.name) && !attr.name.startsWith('data-')) {
        toRemove.push(attr.name);
      }
    }
    toRemove.forEach((name) => element.removeAttribute(name));
  }

  // Clean all children recursively
  Array.from(element.children).forEach((child) => cleanAttributes(child));
}

/**
 * Get the current domain (hostname without www)
 */
export function getCurrentDomain(): string {
  const hostname = window.location.hostname;
  return hostname.replace(/^www\./, '');
}
