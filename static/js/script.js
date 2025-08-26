// static/js/script.js
// Refactored to use modular components

// Import modular components (loaded via script tags in HTML)
// These classes are defined in their respective component files:
// - UIComponents from /static/js/components/ui-components.js  
// - Dashboard from /static/js/components/dashboard.js
// - PowerMonitor from /static/js/components/power-monitor.js

// Initialize application components
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Initialize UI components (menu, comments, dither toggle)
    const uiComponents = new UIComponents();
    uiComponents.init();

    // Initialize dashboard for main page (battery meter, weather, basic stats)
    const dashboard = new Dashboard();
    await dashboard.init();

    // Initialize power monitor for power page (detailed metrics and sparklines)
    if (window.location.pathname.includes("/power/")) {
      const powerMonitor = new PowerMonitor();
      await powerMonitor.init();
    }

  } catch (error) {
    console.error("Failed to initialize application:", error);
  }
});
