/* Info view: app version and browser user agent. Plain ES5. */
(function (root) {
  'use strict';
  var views = (root.TVViews = root.TVViews || {});

  function line(label, text) {
    var p = document.createElement('p');
    p.className = 'info-line';
    p.textContent = label + '：' + text;
    return p;
  }

  views.info = {
    mount: function (el, params, ctx) {
      var h = document.createElement('h1');
      h.textContent = '关于';
      el.appendChild(h);
      el.appendChild(line('版本', root.TVApp ? root.TVApp.VERSION : ''));
      el.appendChild(line('浏览器', root.navigator.userAgent));
      var btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = '返回';
      btn.onclick = function () { root.history.back(); };
      el.appendChild(btn);
      ctx.focus.setRows([[btn]]);
    }
  };
})(typeof window !== 'undefined' ? window : this);
