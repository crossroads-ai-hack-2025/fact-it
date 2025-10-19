/**
 * Fact Check Popup Component
 * Shows detailed explanation, confidence score, and sources
 */

import { Verdict } from '@/shared/types';

export class FactCheckPopup {
  private element: HTMLDivElement;
  private shadowRoot: ShadowRoot;
  private boundHandleOutsideClick: (e: MouseEvent) => void;

  constructor(
    private anchorElement: HTMLElement,
    private result: {
      verdict: Verdict;
      confidence: number;
      explanation: string;
      sources: Array<{ title: string; url: string }>;
      providerResults?: Array<{
        providerId: string;
        providerName: string;
        verdict: 'true' | 'false' | 'unknown';
        confidence: number;
        explanation: string;
      }>;
      consensus?: {
        total: number;
        agreeing: number;
      };
    }
  ) {
    this.element = document.createElement('div');
    this.shadowRoot = this.element.attachShadow({ mode: 'closed' });

    this.element.style.position = 'fixed';
    this.element.style.zIndex = '2147483647';

    this.boundHandleOutsideClick = this.handleOutsideClick.bind(this);

    document.body.appendChild(this.element);
  }

  /**
   * Show the popup
   */
  show(): void {
    const rect = this.anchorElement.getBoundingClientRect();

    // Position below and to the left of indicator (indicator is in top-right corner)
    const popupWidth = 320;
    const popupHeight = 400;
    let top = rect.bottom + 8; // Position below indicator
    let left = rect.right - popupWidth; // Align right edge of popup with indicator

    // Ensure popup stays within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust horizontal position if needed
    if (left < 8) {
      left = 8; // Min left padding
    }
    if (left + popupWidth > viewportWidth - 8) {
      left = viewportWidth - popupWidth - 8; // Max right padding
    }

    // If popup would go below viewport, position above indicator instead
    if (top + popupHeight > viewportHeight - 8) {
      top = rect.top - popupHeight - 8;
      if (top < 8) {
        top = 8; // Fallback to top of viewport
      }
    }

    this.element.style.top = `${top}px`;
    this.element.style.left = `${left}px`;

    const verdictColors: Record<Verdict, string> = {
      true: '#4CAF50',
      false: '#f44336',
      unknown: '#FFC107',
      no_claim: '#9E9E9E',
    };

    const verdictLabels: Record<Verdict, string> = {
      true: 'Verified True',
      false: 'Verified False',
      unknown: 'Unverifiable',
      no_claim: 'No Claims',
    };

    this.shadowRoot.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .popup {
          width: 320px;
          max-height: 400px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
          overflow: hidden;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 14px;
          line-height: 1.5;
          animation: slideIn 0.2s ease-out;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: ${verdictColors[this.result.verdict]};
          color: white;
        }

        .verdict {
          font-weight: 600;
          font-size: 16px;
        }

        .close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          border-radius: 50%;
          transition: background 0.2s;
          line-height: 1;
        }

        .close:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .close:active {
          background: rgba(255, 255, 255, 0.3);
        }

        .content {
          padding: 16px;
          max-height: 320px;
          overflow-y: auto;
        }

        .confidence {
          margin-bottom: 16px;
        }

        .confidence-label {
          font-size: 12px;
          color: #666;
          margin-bottom: 6px;
          font-weight: 500;
        }

        .confidence-bar {
          width: 100%;
          height: 8px;
          background: #E0E0E0;
          border-radius: 4px;
          overflow: hidden;
        }

        .confidence-fill {
          height: 100%;
          background: ${verdictColors[this.result.verdict]};
          width: ${this.result.confidence}%;
          transition: width 0.5s ease-out;
          border-radius: 4px;
        }

        .confidence-text {
          font-size: 11px;
          color: #888;
          margin-top: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .provider-scores {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .provider-score {
          font-size: 11px;
          color: #888;
        }

        .provider-score-label {
          font-weight: 500;
        }

        .overall-score {
          font-weight: 600;
        }

        .explanation {
          margin-bottom: 16px;
          color: #333;
          line-height: 1.6;
        }

        .sources {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #E0E0E0;
        }

        .sources-title {
          font-weight: 600;
          margin-bottom: 10px;
          color: #333;
          font-size: 13px;
        }

        .source {
          margin-bottom: 10px;
        }

        .source:last-child {
          margin-bottom: 0;
        }

        .source a {
          color: #1976D2;
          text-decoration: none;
          font-size: 13px;
          line-height: 1.4;
          display: block;
          transition: color 0.2s;
        }

        .source a:hover {
          color: #1565C0;
          text-decoration: underline;
        }

        .source-domain {
          font-size: 11px;
          color: #999;
          margin-top: 2px;
        }

        .footer {
          padding: 12px 16px;
          background: #F5F5F5;
          border-top: 1px solid #E0E0E0;
          text-align: center;
          font-size: 11px;
          color: #666;
        }

        .footer a {
          color: #1976D2;
          text-decoration: none;
        }

        .footer a:hover {
          text-decoration: underline;
        }

        /* Scrollbar styling */
        .content::-webkit-scrollbar {
          width: 6px;
        }

        .content::-webkit-scrollbar-track {
          background: #F5F5F5;
        }

        .content::-webkit-scrollbar-thumb {
          background: #CCC;
          border-radius: 3px;
        }

        .content::-webkit-scrollbar-thumb:hover {
          background: #999;
        }
      </style>
      <div class="popup">
        <div class="header">
          <div class="verdict">${verdictLabels[this.result.verdict]}</div>
          <button class="close" aria-label="Close" title="Close">×</button>
        </div>

        <div class="content">
          <div class="confidence">
            <div class="confidence-label">Overall Confidence</div>
            <div class="confidence-bar">
              <div class="confidence-fill"></div>
            </div>
            <div class="confidence-text">${this.renderProviderScores()}</div>
          </div>

          <div class="explanation">${this.escapeHtml(this.result.explanation)}</div>

          ${
            this.result.sources.length > 0
              ? `
            <div class="sources">
              <div class="sources-title">Sources</div>
              ${this.result.sources
                .map((source) => {
                  const domain = this.extractDomain(source.url);
                  return `
                <div class="source">
                  <a href="${this.escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer" title="${this.escapeHtml(source.title)}">
                    ${this.escapeHtml(this.truncate(source.title, 60))}
                  </a>
                  <div class="source-domain">${this.escapeHtml(domain)}</div>
                </div>
              `;
                })
                .join('')}
            </div>
          `
              : ''
          }
        </div>

        <div class="footer">
          Powered by <a href="https://github.com/yourusername/fact-it" target="_blank">Fact-It</a> • AI-generated verification
        </div>
      </div>
    `;

    // Prevent clicks inside popup from bubbling to underlying page
    const popupElement = this.shadowRoot.querySelector('.popup');
    popupElement?.addEventListener('click', (e: Event) => {
      e.stopPropagation(); // Prevent clicks from bubbling through to post
    });

    // Close button handler
    const closeBtn = this.shadowRoot.querySelector('.close');
    closeBtn?.addEventListener('click', () => this.hide());

    // Close on click outside (with small delay to avoid immediate close)
    setTimeout(() => {
      document.addEventListener('click', this.boundHandleOutsideClick);
    }, 100);

    // Close on Escape key
    document.addEventListener('keydown', this.handleEscapeKey);
  }

  /**
   * Hide the popup
   */
  hide(): void {
    document.removeEventListener('click', this.boundHandleOutsideClick);
    document.removeEventListener('keydown', this.handleEscapeKey);
    this.element.remove();
  }

  /**
   * Handle clicks outside the popup
   */
  private handleOutsideClick(e: MouseEvent): void {
    const target = e.target as Node;
    if (
      !this.element.contains(target) &&
      !this.anchorElement.contains(target)
    ) {
      this.hide();
    }
  }

  /**
   * Handle Escape key to close popup
   */
  private handleEscapeKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.hide();
    }
  };

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  /**
   * Truncate text to max length
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Render provider scores inline below confidence bar
   */
  private renderProviderScores(): string {
    if (!this.result.providerResults || this.result.providerResults.length === 0) {
      return `${this.result.confidence}% confident`;
    }

    // Map provider IDs to short names
    const providerShortNames: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      perplexity: 'Perplexity',
    };

    const providerScores = this.result.providerResults
      .map((provider) => {
        const shortName = providerShortNames[provider.providerId] || provider.providerName;
        return `<span class="provider-score"><span class="provider-score-label">${shortName}:</span> ${provider.confidence}%</span>`;
      })
      .join('');

    return `
      <div class="provider-scores">
        ${providerScores}
      </div>
      <span class="overall-score">Agg: ${this.result.confidence}%</span>
    `;
  }
}
