// static/js/components/ui-components.js
// Shared UI components and interactions

class UIComponents {
  constructor() {
    this.initialized = false;
  }

  // Mobile menu functionality
  initMobileMenu() {
    const menuToggle = document.querySelector(".menu-toggle");
    const menuItems = document.getElementById("menu-items");

    if (menuToggle && menuItems) {
      menuToggle.addEventListener("click", () => {
        menuItems.classList.toggle("show");
      });

      // Close menu when clicking outside
      document.addEventListener("click", (event) => {
        const menu = document.querySelector(".mobile-menu");
        if (menu && !menu.contains(event.target)) {
          menuItems.classList.remove("show");
        }
      });
    }
  }

  // Comment counter functionality
  initCommentCounter() {
    const comments = document.querySelectorAll(".comment");
    const commentCount = document.getElementById("comment-count");
    
    if (comments.length > 0 && commentCount) {
      commentCount.textContent = comments.length;
    }
  }

  // Dither toggle functionality
  initDitherToggle() {
    document.querySelectorAll(".dither-toggle").forEach((icon) => {
      icon.addEventListener("click", () => {
        const figure = icon.closest(".figure-controls")?.previousElementSibling;
        const img = figure?.querySelector("img");

        if (!figure || !img) return;

        const isDithered = figure.getAttribute("data-imgstate") === "dither";

        if (isDithered) {
          figure.setAttribute("data-imgstate", "undither");
          img.src = img.getAttribute("data-original") || img.src;
        } else {
          figure.setAttribute("data-imgstate", "dither");
          img.src = img.getAttribute("data-dither") || img.src;
        }
      });
    });
  }

  // Generic error handling for failed data loads
  showError(elementId, message = "Data unavailable") {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = `<div class="error">${message}</div>`;
    }
  }

  // Generic loading indicator
  showLoading(elementId, message = "Loading...") {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = `<div class="loading">${message}</div>`;
    }
  }

  // Initialize all UI components
  init() {
    if (this.initialized) return;

    this.initMobileMenu();
    this.initCommentCounter();
    this.initDitherToggle();
    
    this.initialized = true;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIComponents;
} else {
  window.UIComponents = UIComponents;
}