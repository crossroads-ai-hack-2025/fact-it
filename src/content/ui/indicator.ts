/**
 * Fact Check Indicator Component
 * Visual indicator showing fact-check verdict with Shadow DOM for style isolation
 */

import { Verdict } from '@/shared/types';
import { FactCheckPopup } from './popup';

export class FactCheckIndicator {
  private element: HTMLDivElement;
  private shadowRoot: ShadowRoot;
  private popup: FactCheckPopup | null = null;

  constructor(
    private parentElement: Element,
    private elementId: string
  ) {
    this.element = document.createElement('div');
    this.element.id = `fact-check-indicator-${this.elementId}`;

    // Use Shadow DOM for style isolation
    this.shadowRoot = this.element.attachShadow({ mode: 'closed' });

    // Position absolutely in top-right corner
    this.element.style.position = 'absolute';
    this.element.style.top = '8px';
    this.element.style.right = '8px';
    this.element.style.zIndex = '2147483647'; // Maximum z-index

    this.showLoading();
    this.attachToParent();
  }

  /**
   * Attach indicator to parent element
   */
  private attachToParent(): void {
    // Make parent relatively positioned if needed
    const parentStyle = window.getComputedStyle(this.parentElement);
    if (parentStyle.position === 'static') {
      (this.parentElement as HTMLElement).style.position = 'relative';
    }

    this.parentElement.appendChild(this.element);
  }

  /**
   * Show loading state (spinning indicator)
   */
  showLoading(): void {
    this.shadowRoot.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
        }

        .indicator {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #FFC107;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          animation: pulse 1.5s infinite;
          transition: transform 0.2s ease;
          font-family: system-ui, -apple-system, sans-serif;
        }

        .indicator:hover {
          transform: scale(1.1);
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid white;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
      </style>
      <div class="indicator" aria-label="Fact check in progress" role="status">
        <div class="spinner"></div>
      </div>
    `;
  }

  /**
   * Show result with verdict icon
   */
  showResult(result: {
    verdict: Verdict;
    confidence: number;
    explanation: string;
    sources: Array<{ title: string; url: string }>;
  }): void {
    const colors: Record<Verdict, string> = {
      true: '#4CAF50',
      false: '#f44336',
      unknown: '#FFC107',
      no_claim: '#9E9E9E',
    };

    const icons: Record<Verdict, string> = {
      true: '✓',
      false: '✗',
      unknown: '?',
      no_claim: '○',
    };

    const labels: Record<Verdict, string> = {
      true: 'Fact check result: verified true',
      false: 'Fact check result: verified false',
      unknown: 'Fact check result: unverifiable',
      no_claim: 'No factual claims detected',
    };

    this.shadowRoot.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
        }

        .indicator {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: ${colors[result.verdict]};
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 18px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          font-family: system-ui, -apple-system, sans-serif;
          user-select: none;
        }

        .indicator:hover {
          transform: scale(1.15);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .indicator:active {
          transform: scale(1.05);
        }

        @keyframes scaleIn {
          from {
            transform: scale(0);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        .indicator.animate {
          animation: scaleIn 0.3s ease-out;
        }
      </style>
      <div class="indicator animate"
           aria-label="${labels[result.verdict]}"
           tabindex="0"
           role="button">
        ${icons[result.verdict]}
      </div>
    `;

    // Add click handler for popup (only if not no_claim)
    if (result.verdict !== 'no_claim') {
      const indicator = this.shadowRoot.querySelector('.indicator');
      indicator?.addEventListener('click', () => this.showPopup(result));
      indicator?.addEventListener('keydown', (e: Event) => {
        const keyEvent = e as KeyboardEvent;
        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
          e.preventDefault();
          this.showPopup(result);
        }
      });
    }
  }

  /**
   * Show detailed explanation popup
   */
  private showPopup(result: {
    verdict: Verdict;
    confidence: number;
    explanation: string;
    sources: Array<{ title: string; url: string }>;
  }): void {
    // Close existing popup if any
    if (this.popup) {
      this.popup.hide();
    }

    // Create new popup
    this.popup = new FactCheckPopup(this.element, result);
    this.popup.show();
  }

  /**
   * Remove indicator from DOM
   */
  remove(): void {
    if (this.popup) {
      this.popup.hide();
    }
    this.element.remove();
  }
}
