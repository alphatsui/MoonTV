/* Login view. Plain ES5. Never submits stored credentials by itself. */
(function (root) {
  'use strict';
  var views = (root.TVViews = root.TVViews || {});

  function field(name, type, placeholder) {
    var input = document.createElement('input');
    input.name = name;
    input.type = type;
    input.placeholder = placeholder;
    input.className = 'field';
    input.autocomplete = 'off';
    return input;
  }

  views.login = {
    mount: function (el, params, ctx) {
      var gone = false;
      var busy = false;
      var h = document.createElement('h1');
      h.textContent = 'MoonTV 登录';
      var msg = document.createElement('p');
      msg.className = 'msg';
      msg.textContent = params && params.msg === 'expired' ? '登录已失效，请重新登录' : '';
      var user = field('username', 'text', '用户名');
      var pass = field('password', 'password', '密码');
      var btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = '登录';
      el.appendChild(h);
      el.appendChild(msg);
      el.appendChild(user);
      el.appendChild(pass);
      el.appendChild(btn);

      function rows() {
        ctx.focus.setRows(user.parentNode ? [[user], [pass], [btn]] : [[pass], [btn]]);
      }
      rows();

      ctx.api.serverConfig().then(function (cfg) {
        if (gone || !cfg || cfg.StorageType !== 'localstorage') return;
        user.hidden = true;
        user.style.display = 'none';
        el.removeChild(user);
        rows();
      }, function () { /* keep the username field */ });

      btn.onclick = function () {
        if (busy) return;
        busy = true;
        msg.textContent = '';
        var name = user.parentNode ? user.value : '';
        ctx.api.login(name, pass.value).then(function () {
          if (!gone) ctx.replace('home');
        }, function (err) {
          busy = false;
          if (gone) return;
          msg.textContent = (err && err.message) || '登录失败';
        });
      };

      return function () { gone = true; };
    }
  };
})(typeof window !== 'undefined' ? window : this);
