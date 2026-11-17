/* /next/ only: admins see the next version on real data; everyone else goes to live ApexOne. */
(function () {
  if (!/\/next\//.test(location.pathname)) return;
  var n = 0;
  (function chk() {
    var d = (window.__preview || {}).data, r = window.apxRoles ? apxRoles() : [];
    if (window.apxRole && d && d.progs && (r.length || n > 20)) {
      if (apxRole() !== 'admin') { location.replace('/preview/index.html' + location.hash); return; }
      document.title = 'ApexOne · Next';
      var b = document.createElement('div');
      b.textContent = 'Next version · admins only · real data';
      b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;background:#FBDC00;color:#25247B;font:700 11px/1 system-ui,sans-serif;padding:6px 9px;border-radius:4px;pointer-events:none';
      document.body.appendChild(b);
      return;
    }
    if (++n < 120) setTimeout(chk, 500);
  })();
})();
