/**
 * Selector Validator - Tests discovered selectors on the actual page
 * Runs in content script context to access the DOM
 */

import { PlatformSelectors } from '@/shared/types';
import { EXTENSION_NAME } from '@/shared/constants';

export interface ValidationResult {
  valid: boolean;
  postsFound: number;
  textExtractionRate: number; // 0-1
  errors: string[];
}

/**
 * Validate selectors by testing them on the current page
 */
export function validateSelectors(selectors: PlatformSelectors): ValidationResult {
  const errors: string[] = [];
  let postsFound = 0;
  let postsWithText = 0;

  try {
    // Test post container selector
    const containers = document.querySelectorAll(selectors.postContainer);

    if (containers.length === 0) {
      errors.push(`No elements found for postContainer selector: "${selectors.postContainer}"`);
      return {
        valid: false,
        postsFound: 0,
        textExtractionRate: 0,
        errors,
      };
    }

    postsFound = containers.length;

    console.info(
      `${EXTENSION_NAME}: Validation - found ${postsFound} post containers using "${selectors.postContainer}"`
    );

    // Test text content selector on each container
    containers.forEach((container, index) => {
      try {
        const textElement = container.querySelector(selectors.textContent);

        if (textElement) {
          const text = textElement.textContent?.trim() || '';

          if (text.length >= 50) {
            // Minimum text length threshold
            postsWithText++;
          }

          // Log first few for debugging
          if (index < 3) {
            console.info(
              `${EXTENSION_NAME}: Post ${index + 1} text: "${text.substring(0, 100)}..."`
            );
          }
        }
      } catch (err) {
        // Error querying within this container
        if (index === 0) {
          // Only log for first container to avoid spam
          errors.push(
            `Error querying textContent within container: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    });

    const textExtractionRate = postsFound > 0 ? postsWithText / postsFound : 0;

    console.info(
      `${EXTENSION_NAME}: Validation - ${postsWithText}/${postsFound} posts have extractable text (${Math.round(textExtractionRate * 100)}%)`
    );

    // Validation criteria:
    // 1. At least 2 posts found (LinkedIn loads 2-3 initially, more on scroll)
    // 2. At least 65% have extractable text
    const valid = postsFound >= 2 && textExtractionRate >= 0.65;

    if (!valid) {
      if (postsFound < 2) {
        errors.push(`Only ${postsFound} posts found, need at least 2`);
      }
      if (textExtractionRate < 0.65) {
        errors.push(
          `Only ${Math.round(textExtractionRate * 100)}% of posts have text, need at least 65%`
        );
      }
    }

    return {
      valid,
      postsFound,
      textExtractionRate,
      errors,
    };
  } catch (error) {
    errors.push(
      `Validation error: ${error instanceof Error ? error.message : String(error)}`
    );

    return {
      valid: false,
      postsFound,
      textExtractionRate: 0,
      errors,
    };
  }
}

/**
 * Quick validation check - just count posts without detailed analysis
 * Useful for revalidation checks
 */
export function quickValidate(postContainerSelector: string): {
  postsFound: number;
  valid: boolean;
} {
  try {
    const containers = document.querySelectorAll(postContainerSelector);
    const postsFound = containers.length;
    const valid = postsFound >= 2;

    return { postsFound, valid };
  } catch (error) {
    console.error(`${EXTENSION_NAME}: Quick validation failed:`, error);
    return { postsFound: 0, valid: false };
  }
}
