    /* فزاع – حركة الصفحة. */
    (function () {
      var nv = document.getElementById('nv');

      // 1) لينكات الأقسام في البار فوق، من أقسام المنيو نفسها
      var secs = [].slice.call(document.querySelectorAll('.sec'));
      secs.forEach(function (s) {
        var a = document.createElement('a');
        a.href = '#' + s.id;
        a.dataset.id = s.id;
        a.textContent = s.dataset.nav || s.querySelector('h3').textContent.trim();
        nv.appendChild(a);
      });

      // 2) عدد خانات المقاسات + تأخير الظهور
      document.querySelectorAll('.chs').forEach(function (c) { c.style.setProperty('--n', c.children.length) });
      secs.forEach(function (s) {
        [].forEach.call(s.querySelectorAll('.it'), function (x, j) { x.style.setProperty('--d', (j % 6) * .07 + 's') });
      });

      // 3) ظهور الأصناف وانت بتنزل
      var items = [].slice.call(document.querySelectorAll('.it'));
      if ('IntersectionObserver' in window) {
        items.forEach(function (x) { x.classList.add('pre') });
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            if (e.isIntersecting) {
              var el = e.target; el.classList.add('v'); io.unobserve(el);
              setTimeout(function () { el.classList.remove('pre', 'v') }, 1300);
            }
          })
        }, { threshold: .12 });
        items.forEach(function (x) { io.observe(x) });

        // 4) تمييز القسم الحالي في البار
        var links = [].slice.call(nv.querySelectorAll('a[data-id]'));
        var so = new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            if (!e.isIntersecting) return;
            links.forEach(function (a) {
              var on = a.dataset.id === e.target.id;
              a.classList.toggle('on', on);
              if (on) nv.scrollTo({ left: a.offsetLeft - nv.clientWidth / 2 + a.clientWidth / 2, behavior: 'smooth' });
            });
          })
        }, { rootMargin: '-40% 0px -55% 0px' });
        secs.forEach(function (s) { so.observe(s) });
      }

      // 5) ميلان اللوجو مع الماوس (على الكمبيوتر بس، مش على الموبايل)
      var st = document.getElementById('stage');
      if (st && window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
        addEventListener('pointermove', function (e) {
          var x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
          st.style.transform = 'rotateY(' + (x * 12) + 'deg) rotateX(' + (-y * 12) + 'deg)';
        });
      }

      // 6) رقم التليفون من مكان واحد: data-phone في وسم body
      var raw = document.body.getAttribute('data-phone');
      if (raw) {
        var d = raw.replace(/\D/g, '');
        var local = d.replace(/^0/, '');
        var intl = '+20' + local;
        var pretty = '+20 ' + local.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3');
        [].forEach.call(document.querySelectorAll('a[href^="tel:"]'), function (a) { a.href = 'tel:' + intl });
        [].forEach.call(document.querySelectorAll('.ph'), function (s) { s.textContent = pretty });
      }

      // 7) الضغط على اللوجو في البار: يرجّع الصفحة من الأول (ريستارت للموقع)
      var home = nv.querySelector('a.home');
      if (home) {
        home.addEventListener('click', function (e) {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          nv.scrollTo({ left: 0, behavior: 'smooth' });
          [].forEach.call(nv.querySelectorAll('a.on'), function (a) { a.classList.remove('on') });
          if (history.replaceState) { try { history.replaceState(null, '', location.pathname + location.search) } catch (_) { } }
        });
      }

      // لما تكون فوق في الهيرو، مفيش قسم متعلّم في البار
      addEventListener('scroll', function () {
        if (scrollY < 250) [].forEach.call(nv.querySelectorAll('a.on'), function (a) { a.classList.remove('on') });
      }, { passive: true });

      // 8) لينكات السوشيال من مكان واحد: data-fb و data-ig في وسم body
      ['fb', 'ig'].forEach(function (k) {
        var u = document.body.getAttribute('data-' + k);
        if (u) [].forEach.call(document.querySelectorAll('[data-soc="' + k + '"]'), function (a) { a.href = u });
      });

      // 9) بوب أب "تابعنا" بيظهر مرة واحدة في الزيارة
      var fu = document.getElementById('fu'), fux = document.getElementById('fux');
      if (fu) {
        var seen = false; try { seen = sessionStorage.getItem('fz_fu') } catch (_) { }
        var done = function () { fu.classList.remove('on'); try { sessionStorage.setItem('fz_fu', '1') } catch (_) { } };
        if (!seen) {
          setTimeout(function () { fu.classList.add('on') }, 2500);
          setTimeout(done, 16000);
        }
        if (fux) fux.addEventListener('click', done);
        [].forEach.call(fu.querySelectorAll('a'), function (a) { a.addEventListener('click', done) });
      }
    })();
  
