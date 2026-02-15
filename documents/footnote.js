/**
 * 使い方
 * 1) 脚注本体を HTML 上で指定する
 *    - <span data-footnote>本文</span>
 * 2) 脚注リストの置き場を用意する
 *    - <div id="footnote"></div>
 * 挙動
 * - 脚注は出現順に [†1], [†2], ... の順で採番する。
 * - 本文側に脚注マーカーを挿入し、本文中から脚注一覧にジャンプ可能にする。
 */
document.addEventListener('DOMContentLoaded', () => {
    const FOOTNOTE_CONTAINER_ID = 'footnote';
    const FOOTNOTE_SELECTOR = '[data-footnote]';
    const STYLE_ID = 'footnote-style';

    const FOOTNOTE_STYLE = '#footnote div { margin-bottom: 0.6em; margin-left: 1em; text-indent: -1em; }';

    const escapeHtmlAttribute = function (value) {
        value = value || '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };

    const makeAnchor = function (count, contentId, anchorId, title) {
        return '<sup><a id="' + anchorId + '" href="#' + contentId + '" title="' + escapeHtmlAttribute(title) + '">&dagger;' + count + '</a></sup>';
    };

    const makeEntry = function (count, contentId, html) {
        return '<sup><a href="#' + contentId + '">&dagger;' + count + '</a></sup> ' + html;
    };

    const injectStyle = function () {
        if (!document.querySelector('style#' + STYLE_ID)) {
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = FOOTNOTE_STYLE;
            document.head.appendChild(style);
        }
    };

    const renderFootnotes = function () {
        const container = document.getElementById(FOOTNOTE_CONTAINER_ID);
        const footnotes = document.querySelectorAll(FOOTNOTE_SELECTOR);
        let count = 0;
        let i;

        if (!container) {
            return;
        }

        container.innerHTML = '';

        for (i = 0; i < footnotes.length; i++) {
            const footnote = footnotes[i];
            const marker = ++count;
            const contentId = 'fn-content-' + marker;
            const anchorId = 'fn-anchor-' + marker;
            const html = footnote.innerHTML || '';
            const title = (footnote.textContent || '')
                .replace(/\s+/g, ' ')
                .trim();
            const entry = makeEntry(marker, contentId, html);
            const wrapper = document.createElement('div');
            wrapper.id = contentId;
            wrapper.innerHTML = entry;
            container.appendChild(wrapper);
            footnote.outerHTML = makeAnchor(marker, contentId, anchorId, title);
        }
    };

    injectStyle();
    renderFootnotes();
});
