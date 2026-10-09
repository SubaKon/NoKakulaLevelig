/*
 * Часть кода в этом файле (вставка текста в Slate-редактор Twitch) 
 * адаптирована из репозитория SevenTV (https://github.com/SevenTV/Extension).
 * Оригинальный код распространяется под лицензией Apache 2.0 с условием Commons Clause v1.0.
 */

(function () {
  'use strict';

  // Ключ для повторной инициализации при навигации SPA.
  if (window.__NKL_PAGE_WORLD_LOADED) return;
  window.__NKL_PAGE_WORLD_LOADED = true;

  const INPUT_SELECTOR = '[data-a-target="chat-input"][data-slate-editor="true"]';

  // ==================== Порт ReactHooks.ts (SevenTV) ====================

  // Точно как getVNodeFromDOM у SevenTV.
  function getVNodeFromDOM(el) {
    for (const k in el) {
      if (k.startsWith('__reactInternalInstance$') || k.startsWith('__reactFiber$')) {
        return Reflect.get(el, k);
      }
    }
    return undefined;
  }

  // Порт findComponentParents: подъём вверх по fiber-дереву до stateNode-компонентов.
  // Возвращаем все подходящие components (predicate решает, что нам нужно).
  function findComponentParents(node, predicate, maxTraversal, limit) {
    if (maxTraversal === undefined) maxTraversal = 350;
    if (limit === undefined) limit = Infinity;

    const components = [];
    let current = node;
    let travel = 0;

    while (current && components.length < limit && travel <= maxTraversal) {
      if (current.stateNode && (current.stateNode instanceof Element) === false) {
        const component = current.stateNode;
        if (predicate(component)) components.push(component);
      }
      current = current.return;
      travel++;
    }
    return components;
  }

  // Проверка, что объект похож на Slate-редактор (движок Editor).
  function isSlateLike(s) {
    return !!(s && typeof s.apply === 'function' && Array.isArray(s.children));
  }

  // Извлечение slateEditor из компонента — все варианты, что встречаются
  // в разных билдах Twitch ChatInput.vue (class state / hooks memoizedState /
  // прямой ref на движок).
  function extractSlate(n) {
    if (!n) return null;
    if (isSlateLike(n) && n.isEditable !== undefined) return n; // сам движок
    const c1 = n.componentRef && n.componentRef.state && n.componentRef.state.slateEditor;
    if (isSlateLike(c1)) return c1;
    const c2 = n.state && n.state.slateEditor;
    if (isSlateLike(c2)) return c2;
    const c3 = n.slateEditor;
    if (isSlateLike(c3)) return c3;
    // Хуки функционального компонента: memoizedState — связка хук-объектов,
    // в каждом может лежать значение (в т.ч. ref со slateEditor внутри).
    try {
      let hook = n.memoizedState;
      let guard = 0;
      while (hook && guard++ < 60) {
        const ms = hook.memoizedState;
        if (isSlateLike(ms)) return ms;
        if (ms && typeof ms === 'object') {
          if ('current' in ms && isSlateLike(ms.current)) return ms.current;
          if (isSlateLike(ms.slateEditor)) return ms.slateEditor;
        }
        hook = hook.next;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // Порт findComponentChildren: DFS вниз по fiber-дереву со стеком path/sibling.
  function findComponentChildren(node, predicate, maxDepth, limit) {
    if (maxDepth === undefined) maxDepth = 350;
    if (limit === undefined) limit = Infinity;

    const components = [];
    let current = node;
    const path = [];

    for (;;) {
      if (components.length >= limit) break;

      if (!current || path.length > maxDepth) {
        const parent = path.pop();
        if (parent) {
          current = parent.sibling;
          continue;
        } else {
          break;
        }
      }

      if (current.stateNode && (current.stateNode instanceof Element) === false) {
        const component = current.stateNode;
        if (predicate(component)) components.push(component);
      }

      path.push(current);
      current = current.child;
    }
    return components;
  }

  // ==================== Поиск Slate-редактора ====================
  // Семантика как в ChatInputModule.vue + ChatInput.vue SevenTV:
  //   parentSelector: ".chat-input__textarea", predicate: n => n.providers
  //   затем slate = component.componentRef.state?.slateEditor

  function getSlateCandidates() {
    const out = [];
    const seen = new Set();
    const pushSlate = function (s) {
      if (s && isSlateLike(s) && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    };

    // --- Путь 1 (как у SevenTV): от контейнера .chat-input__textarea вниз
    // по fiber-дереву ищем компонент с props.providers, затем его slateEditor.
    const host = document.querySelector('.chat-input__textarea');
    if (host) {
      const vnode = getVNodeFromDOM(host);
      if (vnode) {
        const byProviders = findComponentChildren(
          vnode,
          function (n) {
            return !!(n && n.providers);
          },
          50
        );
        for (const c of byProviders) pushSlate(extractSlate(c));
      }
    }
    if (out.length) return out;

    // --- Путь 2: от САМОГО contenteditable ВВЕРХ по fiber-дереву
    // (findComponentParents). Проверяем каждый stateNode через extractSlate —
    // он знает все варианты хранения редактора в разных билдах Twitch.
    const editorEl = document.querySelector(INPUT_SELECTOR);
    if (editorEl) {
      const ev = getVNodeFromDOM(editorEl);
      if (ev) {
        const parents = findComponentParents(ev, function (n) {
          return !!extractSlate(n);
        });
        for (const p of parents) pushSlate(extractSlate(p));

        // Дополнительно: сам fiber-узел contenteditable может нести движок
        // в props (slatejs прокидывает editor как prop компонента Slate).
        let f = ev;
        let guard = 0;
        while (f && guard++ < 60) {
          if (f.memoizedProps) {
            pushSlate(f.memoizedProps.editor);
            pushSlate(f.memoizedProps.slate);
            pushSlate(f.memoizedProps.slateEditor);
          }
          f = f.return;
        }
      }
    }
    if (out.length) return out;

    // --- Путь 3 (самый надёжный, «грязный» но работает всегда):
    // обход ВСЕХ DOM-узлов страницы и поиск fiber'ов, чьи stateNode/props
    // содержат объект, похожий на Slate-редактор. Ограничиваем глубину,
    // чтобы не зависнуть. Вызывается только если пути 1-2 ничего не дали.
    try {
      const all = document.querySelectorAll('div, span');
      let checked = 0;
      for (const el of all) {
        if (checked > 4000) break;
        const fv = getVNodeFromDOM(el);
        if (!fv) continue;
        checked++;
        let f = fv;
        let depth = 0;
        while (f && depth++ < 8) {
          if (f.stateNode && !(f.stateNode instanceof Element)) {
            pushSlate(extractSlate(f.stateNode));
          }
          if (f.memoizedProps) {
            pushSlate(f.memoizedProps.editor);
            pushSlate(f.memoizedProps.slate);
          }
          f = f.return;
        }
        if (out.length) break; // нашли — выходим
      }
    } catch (e) { /* ignore */ }

    return out;
  }

  // Находим редактор, чей текст содержит наш "!токен" — это защищает от
  // выбора неправильного экземпляра редактора на страницах с несколькими чатами.
  function pickSlateForToken(tokenStartAbs, tokenLen) {
    const candidates = getSlateCandidates();
    if (candidates.length === 1) return candidates[0];
    if (candidates.length === 0) return null;

    // При нескольких кандидатах сверяем полный текст редактора с DOM-текстом поля.
    const editorEl = document.querySelector(INPUT_SELECTOR);
    const domText = editorEl ? editorEl.textContent || '' : '';
    for (const slate of candidates) {
      let text = '';
      for (const para of slate.children) {
        for (const leaf of para.children || []) {
          if (typeof leaf.text === 'string') text += leaf.text;
        }
      }
      if (text === domText || domText.includes(text.slice(0, 20))) return slate;
    }
    return candidates[0];
  }

  // ==================== Операции над Slate (порт handleTabPress) ====================

  // Плоский обход текстовых листов slate.children с абсолютными offset'ами.
  // Возвращает {path:[i,j], leafStart, leafEnd, text} для листа, содержащего absOffset.
  function locateLeaf(slate, absOffset) {
    let abs = 0;
    for (let i = 0; i < slate.children.length; i++) {
      const para = slate.children[i];
      const leaves = para.children || [];
      for (let j = 0; j < leaves.length; j++) {
        const leaf = leaves[j];
        const txt = typeof leaf.text === 'string' ? leaf.text : '';
        const start = abs;
        const end = abs + txt.length;
        abs = end;
        if (absOffset <= end) {
          return { path: [i, j], leafStart: start, leafEnd: end, text: txt };
        }
      }
    }
    return null;
  }

  // Замена набранного "!токена" перед курсором на полную команду.
  // Один-в-один приём SevenTV: remove_text + insert_text + set_selection.
  function applyReplacement(slate, caretAbs, replacement) {
    const loc = locateLeaf(slate, caretAbs);
    if (!loc) return false;

    // Смещение внутри листа.
    const relCaret = Math.max(0, Math.min(loc.text.length, caretAbs - loc.leafStart));
    const upto = loc.text.slice(0, relCaret);

    // Ищем начатый "!..." токен прямо перед курсором (как getSearchRange у них,
    // но ограничиваем слева концом строки/пробелом).
    const m = upto.match(/(?:^|\s)(!\S*)$/);
    if (!m) return false;

    const wordStart = relCaret - m[1].length;
    const currentWord = m[1];

    // Три операции — ровно как в handleTabPress ChatInput.vue:
    slate.apply({ type: 'remove_text', path: loc.path, offset: wordStart, text: currentWord });
    slate.apply({ type: 'insert_text', path: loc.path, offset: wordStart, text: replacement });

    const newCursor = { path: loc.path, offset: wordStart + replacement.length };
    slate.apply({ type: 'set_selection', newProperties: { anchor: newCursor, focus: newCursor } });

    return true;
  }

  // ==================== Мост с content-script (postMessage) ====================

  function send(msg) {
    try {
      window.postMessage(Object.assign({ source: 'nkl-page' }, msg), '*');
    } catch (e) { /* ignore */ }
  }

  window.addEventListener('message', function (ev) {
    const d = ev.data;
    if (!d || d.source !== 'nkl-content') return;

    if (d.type === 'nkl-ping') {
      send({ type: 'nkl-ready' });
      return;
    }

    if (d.type === 'nkl-insert-command') {
      try {
        const caretAbs = typeof d.caret === 'number' && d.caret >= 0 ? d.caret : null;
        const replacement = String(d.command || '') + ' ';
        const slates = getSlateCandidates();
        let ok = false;

        for (const slate of slates) {
          const caret = caretAbs !== null ? caretAbs : fullTextLength(slate);
          if (applyReplacement(slate, caret, replacement)) { ok = true; break; }
        }

        send({ type: 'nkl-insert-result', id: d.id, ok: ok, found: slates.length });
      } catch (e) {
        send({ type: 'nkl-insert-result', id: d.id, ok: false, error: String(e && e.message || e) });
      }
      return;
    }

    // Диагностика для разработчика: что вообще удалось найти в MAIN world.
    // В консоли страницы (F12) можно вызвать проверку через postMessage-ответ.
    if (d.type === 'nkl-diag') {
      try {
        const host = document.querySelector('.chat-input__textarea');
        const editorEl = document.querySelector(INPUT_SELECTOR);
        const hv = host ? getVNodeFromDOM(host) : null;
        const evv = editorEl ? getVNodeFromDOM(editorEl) : null;
        const providers = hv
          ? findComponentChildren(hv, function (n) { return !!(n && n.providers); }, 50)
          : [];
        const slates = getSlateCandidates();
        send({
          type: 'nkl-diag-result',
          id: d.id,
          hasHost: !!host,
          hasEditor: !!editorEl,
          hostHasFiber: !!hv,
          editorHasFiber: !!evv,
          providersCount: providers.length,
          providerKeys: providers.map(function (p) {
            return Object.keys(p).filter(function (k) {
              return /slate|editor/i.test(k);
            });
          }),
          slatesFound: slates.length,
          slateTexts: slates.map(function (s) {
            let t = '';
            for (const para of s.children || []) {
              for (const leaf of para.children || []) {
                if (typeof leaf.text === 'string') t += leaf.text;
              }
            }
            return JSON.stringify(t.slice(0, 40));
          }),
        });
      } catch (e) {
        send({ type: 'nkl-diag-result', id: d.id, error: String(e && e.message || e) });
      }
      return;
    }
  });

  function fullTextLength(slate) {
    let n = 0;
    for (const para of slate.children || []) {
      for (const leaf of para.children || []) {
        if (typeof leaf.text === 'string') n += leaf.text.length;
      }
    }
    return n;
  }

  // Сообщаем о себе сразу и повторно (content-script мог ещё не слушать).
  send({ type: 'nkl-ready' });
  setTimeout(function () { send({ type: 'nkl-ready' }); }, 300);

  // При навигации по SPA чат пересоздаётся, но этот скрипт остаётся живым —
  // периодически подтверждать готовность не нужно; content script сам
  // шлёт 'nkl-ping' при каждом подключении к новому полю ввода.
})();