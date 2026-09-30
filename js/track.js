// js/track.js
// Drop <script src="/js/track.js" defer></script> near the end of any page's <body>
// to log a page view to Supabase for the admin traffic dashboard.

(function () {
  var SUPABASE_URL = "https://mfnndtyhmlofqegzdbrw.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mbm5kdHlobWxvZnFlZ3pkYnJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MDAxNzIsImV4cCI6MjEwNTk3NjE3Mn0.wj9YWt67wDVp5cl6tIBlvywz7nshCSBg9cJUGp--cBA";

  if (SUPABASE_URL.indexOf("YOUR_SUPABASE") === 0) {
    // Not configured yet — skip silently instead of breaking the page.
    return;
  }

  fetch(SUPABASE_URL + "/rest/v1/page_views", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + SUPABASE_ANON_KEY,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      page: window.location.pathname,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
    }),
  }).catch(function () {
    /* fail silently — never block the page for analytics */
  });
})();
