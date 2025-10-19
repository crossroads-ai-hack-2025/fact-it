/**
 * Manual Check Button Component
 * Displayed when auto-check is disabled, allows users to manually trigger fact-checking
 */

export class CheckButton {
  private element: HTMLDivElement;
  private shadowRoot: ShadowRoot;
  private onCheckCallback: (() => void) | null = null;
  public readonly parentElement: Element; // Public for access when replacing with indicator

  constructor(
    parentElement: Element,
    private elementId: string
  ) {
    this.parentElement = parentElement;
    this.element = document.createElement('div');
    this.element.id = `fact-check-button-${this.elementId}`;

    // Use Shadow DOM for style isolation
    this.shadowRoot = this.element.attachShadow({ mode: 'closed' });

    // Position absolutely slightly outside top-right corner of card
    this.element.style.position = 'absolute';
    this.element.style.top = '-10px';
    this.element.style.right = '-10px';
    this.element.style.zIndex = '2147483647'; // Maximum z-index

    this.showButton();
    this.attachToParent();
  }

  /**
   * Attach button to parent element
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
   * Set callback for when user clicks check button
   */
  onCheck(callback: () => void): void {
    this.onCheckCallback = callback;
  }

  /**
   * Show the manual check button (circular badge style matching indicator)
   */
  private showButton(): void {
    this.shadowRoot.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
        }

        .check-button {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #1976D2;
          color: white;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 16px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
          font-family: system-ui, -apple-system, sans-serif;
          user-select: none;
        }

        .check-button:hover {
          background: #1565C0;
          transform: scale(1.15);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .check-button:active {
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

        .check-button.animate {
          animation: scaleIn 0.3s ease-out;
        }
      </style>
      <button class="check-button animate"
              aria-label="Click to fact-check this post"
              tabindex="0"
              role="button">
        ▶
      </button>
    `;

    // Add click handler
    const button = this.shadowRoot.querySelector('.check-button');
    button?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.handleClick();
    });

    button?.addEventListener('keydown', (e: Event) => {
      const keyEvent = e as KeyboardEvent;
      if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.handleClick();
      }
    });
  }

  /**
   * Handle button click
   */
  private handleClick(): void {
    // Transition to loading state
    this.showLoading();

    // Call the callback
    if (this.onCheckCallback) {
      this.onCheckCallback();
    }
  }

  /**
   * Show loading state (called when user clicks button)
   */
  showLoading(): void {
    this.shadowRoot.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
        }

        .indicator {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #FFC107;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: wait;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          animation: pulse 1.5s infinite;
          font-family: system-ui, -apple-system, sans-serif;
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
          width: 14px;
          height: 14px;
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
   * Remove button from DOM
   */
  remove(): void {
    this.element.remove();
  }
}
