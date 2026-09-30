/* js/auth-widget.js
   Include on every public page:  <script src="/js/auth-widget.js" defer></script>
   (use "../js/auth-widget.js" for pages inside a subfolder, e.g. /find-it/, /opportunities/)

   This does NOT touch the existing PIN-based posting/deleting on Buy & Sell or Auctions —
   those keep working exactly as before, for everyone, with no account needed.
   This just offers an OPTIONAL free account so people can get emailed about:
   new listings, auctions, opportunities, and "If it exists, we can find it" reminders.
*/
(function () {
  // ====== CONFIGURE ONCE, HERE ======
  var SUPABASE_URL = "https://mfnndtyhmlofqegzdbrw.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mbm5kdHlobWxvZnFlZ3pkYnJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MDAxNzIsImV4cCI6MjEwNTk3NjE3Mn0.wj9YWt67wDVp5cl6tIBlvywz7nshCSBg9cJUGp--cBA";
  // ===================================

  if (SUPABASE_URL.indexOf("YOUR_SUPABASE") === 0) return; // not configured yet — do nothing

  var DISMISS_KEY = "authWidgetDismissed"; // sessionStorage — reappears each new visit/tab

  function loadScript(src, cb) {
    var s = document.createElement("script");
    s.src = src;
    s.onload = cb;
    document.head.appendChild(s);
  }

  function init() {
    var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    injectStyles();
    var root = document.createElement("div");
    root.id = "authWidgetRoot";
    document.body.appendChild(root);

    window.AuthWidget = {
      client: supabase,
      session: null,
      // Call this to gate any action: if logged in, runs `action` immediately.
      // If not, opens sign up/log in and runs `action` right after success.
      // `reason` is a short sentence explaining why an account is needed.
      requireAccount: function (action, reason) {
        if (window.AuthWidget.session) { action(window.AuthWidget.session); return; }
        openAuthModal(supabase, root, reason, action);
      }
    };

    supabase.auth.getSession().then(function (res) {
      window.AuthWidget.session = res.data.session;
      renderWidget(supabase, root, res.data.session);
    });

    supabase.auth.onAuthStateChange(function (_event, session) {
      window.AuthWidget.session = session;
      renderWidget(supabase, root, session);
    });
  }

  function injectStyles() {
    var css = `
      #authWidgetRoot{position:fixed;bottom:18px;right:18px;z-index:9999;font-family:'Inter',Arial,sans-serif;}
      .aw-pill{background:var(--primary,#38bdf8);color:#fff;padding:12px 18px;border-radius:30px;
        box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;align-items:center;gap:10px;cursor:pointer;
        font-size:13px;font-weight:700;max-width:280px;}
      .aw-pill.logged{background:var(--card,#111827);color:var(--text,#e5e7eb);border:1px solid var(--line,rgba(255,255,255,.15));}
      .aw-close{background:rgba(255,255,255,.25);border:none;color:inherit;width:20px;height:20px;border-radius:50%;
        cursor:pointer;font-size:12px;line-height:1;flex-shrink:0;}
      .aw-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:10000;padding:16px;}
      .aw-overlay.open{display:flex;}
      .aw-modal{background:var(--card,#111827);color:var(--text,#e5e7eb);border-radius:14px;padding:26px;width:100%;max-width:360px;
        border:1px solid var(--line,rgba(255,255,255,.1));}
      .aw-modal h3{margin:0 0 6px;font-size:18px;}
      .aw-modal p.aw-sub{color:var(--dim,#9ca3af);font-size:13px;margin:0 0 16px;}
      .aw-tabs{display:flex;gap:8px;margin-bottom:16px;}
      .aw-tab{flex:1;text-align:center;padding:8px;border-radius:8px;background:transparent;border:1px solid var(--line,rgba(255,255,255,.15));
        color:var(--dim,#9ca3af);cursor:pointer;font-size:13px;font-weight:600;}
      .aw-tab.active{background:var(--primary,#38bdf8);color:#fff;border-color:var(--primary,#38bdf8);}
      .aw-modal input[type=text],.aw-modal input[type=password]{width:100%;padding:10px;margin-bottom:10px;border-radius:8px;
        border:1px solid var(--line,rgba(255,255,255,.15));background:var(--field,#0b1220);color:var(--text,#e5e7eb);font-size:14px;}
      .aw-modal button.aw-submit{width:100%;padding:11px;border:none;border-radius:8px;background:var(--primary,#38bdf8);
        color:#fff;font-weight:700;cursor:pointer;font-size:14px;margin-top:4px;}
      .aw-error{color:#ef4444;font-size:12px;margin-top:8px;min-height:14px;}
      .aw-close-modal{position:absolute;top:14px;right:16px;background:none;border:none;color:var(--dim,#9ca3af);font-size:18px;cursor:pointer;}
      .aw-modal{position:relative;}
      .aw-prefs label{display:flex;align-items:center;gap:8px;font-size:13px;margin:8px 0;color:var(--text,#e5e7eb);}
      .aw-logout{background:none;border:none;color:#ef4444;font-size:12px;cursor:pointer;text-decoration:underline;margin-top:10px;}
    `;
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function renderWidget(supabase, root, session) {
    root.innerHTML = "";

    if (session && session.user) {
      renderLoggedIn(supabase, root, session);
      return;
    }

    if (sessionStorage.getItem(DISMISS_KEY)) return;

    var pill = document.createElement("div");
    pill.className = "aw-pill";
    pill.innerHTML = '<span>🔔 Get notified about new listings, auctions & opportunities</span>' +
      '<button class="aw-close" title="Dismiss">✕</button>';
    pill.onclick = function (e) {
      if (e.target.classList.contains("aw-close")) {
        sessionStorage.setItem(DISMISS_KEY, "1");
        root.innerHTML = "";
        return;
      }
      openAuthModal(supabase, root, null, null);
    };
    root.appendChild(pill);
  }

  function renderLoggedIn(supabase, root, session) {
    var pill = document.createElement("div");
    pill.className = "aw-pill logged";
    pill.innerHTML = '<span>👤 ' + escapeHtml(session.user.email) + '</span>';
    pill.onclick = function () { openPrefsModal(supabase, root, session); };
    root.appendChild(pill);
  }

  function overlay(inner) {
    var ov = document.createElement("div");
    ov.className = "aw-overlay open";
    ov.innerHTML = '<div class="aw-modal">' +
      '<button class="aw-close-modal">✕</button>' + inner + '</div>';
    ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
    ov.querySelector(".aw-close-modal").onclick = function () { ov.remove(); };
    document.body.appendChild(ov);
    return ov;
  }

  function openAuthModal(supabase, root, reason, onSuccess) {
    var subText = reason ||
      'Optional — get emailed about new listings, auctions, opportunities, and reminders from "If it exists, we can find it." Posting and deleting items still works without an account, using your PIN, exactly as before.';
    var ov = overlay(
      '<h3>Create a free account</h3>' +
      '<p class="aw-sub">' + subText + '</p>' +
      '<div class="aw-tabs">' +
        '<div class="aw-tab active" data-tab="signup">Sign Up</div>' +
        '<div class="aw-tab" data-tab="login">Log In</div>' +
      '</div>' +
      '<input type="text" id="awEmail" placeholder="Email">' +
      '<input type="password" id="awPassword" placeholder="Password">' +
      '<button class="aw-submit" id="awSubmit">Create Account</button>' +
      '<div class="aw-error" id="awError"></div>'
    );

    var mode = "signup";
    ov.querySelectorAll(".aw-tab").forEach(function (tab) {
      tab.onclick = function () {
        ov.querySelectorAll(".aw-tab").forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        mode = tab.dataset.tab;
        ov.querySelector("#awSubmit").textContent = mode === "signup" ? "Create Account" : "Log In";
      };
    });

    ov.querySelector("#awSubmit").onclick = async function () {
      var email = ov.querySelector("#awEmail").value.trim();
      var password = ov.querySelector("#awPassword").value;
      var errEl = ov.querySelector("#awError");
      errEl.textContent = "";
      if (!email || !password) { errEl.textContent = "Enter an email and password."; return; }

      var result = mode === "signup"
        ? await supabase.auth.signUp({ email: email, password: password })
        : await supabase.auth.signInWithPassword({ email: email, password: password });

      if (result.error) {
        errEl.textContent = result.error.message;
        return;
      }

      if (mode === "signup" && result.data && !result.data.session) {
        // Email confirmation is required before a session exists
        errEl.style.color = "#22c55e";
        errEl.textContent = "Account created — check your email to confirm, then log in.";
        return;
      }

      ov.remove();
      if (onSuccess && result.data && result.data.session) {
        onSuccess(result.data.session);
      }
    };
  }

  function openPrefsModal(supabase, root, session) {
    var ov = overlay(
      '<h3>Your notifications</h3>' +
      '<p class="aw-sub">Signed in as ' + escapeHtml(session.user.email) + '</p>' +
      '<div class="aw-prefs">' +
        '<label><input type="checkbox" id="pBuySell"> New Buy & Sell listings</label>' +
        '<label><input type="checkbox" id="pAuctions"> Auction updates & reminders</label>' +
        '<label><input type="checkbox" id="pOpportunities"> New opportunities posted</label>' +
        '<label><input type="checkbox" id="pFindIt"> "If it exists, we can find it" reminders</label>' +
      '</div>' +
      '<button class="aw-submit" id="awSavePrefs">Save Preferences</button>' +
      '<div class="aw-error" id="awPrefsMsg"></div>' +
      '<button class="aw-logout" id="awLogout">Log out</button>'
    );

    supabase.from("profiles").select("*").eq("id", session.user.id).single().then(function (res) {
      var p = res.data || {};
      ov.querySelector("#pBuySell").checked = p.notify_buy_sell !== false;
      ov.querySelector("#pAuctions").checked = p.notify_auctions !== false;
      ov.querySelector("#pOpportunities").checked = p.notify_opportunities !== false;
      ov.querySelector("#pFindIt").checked = p.notify_find_it !== false;
    });

    ov.querySelector("#awSavePrefs").onclick = async function () {
      var msg = ov.querySelector("#awPrefsMsg");
      var { error } = await supabase.from("profiles").upsert({
        id: session.user.id,
        email: session.user.email,
        notify_buy_sell: ov.querySelector("#pBuySell").checked,
        notify_auctions: ov.querySelector("#pAuctions").checked,
        notify_opportunities: ov.querySelector("#pOpportunities").checked,
        notify_find_it: ov.querySelector("#pFindIt").checked,
      });
      msg.style.color = error ? "#ef4444" : "#22c55e";
      msg.textContent = error ? error.message : "Saved ✓";
    };

    ov.querySelector("#awLogout").onclick = async function () {
      await supabase.auth.signOut();
      ov.remove();
    };
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  if (window.supabase) {
    init();
  } else {
    loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2", init);
  }
})();
