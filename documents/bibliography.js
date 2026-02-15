/**
 * 使い方
 * 1) 文献定義を HTML に埋める
 *    - <p data-bib-key="key">...</p>
 * 2) 文中の引用位置に書く
 *    - <span data-cite="key"></span>
 * 3) 参照リストの置き場を用意する
 *    - <div id="bibliography"></div>
 * 挙動
 * - 同じキーは最初に現れた順で [1], [2], ... と番号付けされる。
 * - 文献の本文は HTML を除去して空白を正規化してから表示される。
 */
document.addEventListener('DOMContentLoaded', () => {
    const BIB_LIST_ID = 'bibliography';
    const BIB_PREFIX = 'bib-';
    const STYLE_ID = 'bibliography-style';

    const BIB_LIST_SELECTOR = '#' + BIB_LIST_ID;
    const BIB_ITEM_SELECTOR = '[data-bib-key]';
    const CITE_SELECTOR = '[data-cite]';

    const BIBLIOGRAPHY_STYLE = [
        '#bibliography ol li { list-style: none; }',
        '#bibliography ol { counter-reset: list; padding: 0; margin: 0; }',
        '#bibliography ol > li { display: table; counter-increment: list; margin-bottom: 0.6em; }',
        '#bibliography ol > li:before { content: "[" counter(list, decimal) "] "; display: table-cell; padding-right: .6em; }'
    ].join('\n');

    const normalizeText = function (value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    };

    const escapeHtmlAttribute = function (value) {
        value = value || '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };

    const formatAnchor = function (number, targetId, title) {
        return '<sup>[<a href="#' + targetId + '" title="' + escapeHtmlAttribute(title) + '">' + number + '</a>]</sup>';
    };

    const getBibliographyTag = function (element) {
        return (element.getAttribute('data-bib-key') || '').trim();
    };

    const getCitationTag = function (element) {
        return (element.getAttribute('data-cite') || '').trim();
    };

    const injectStyle = function () {
        if (!document.querySelector('style#' + STYLE_ID)) {
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = BIBLIOGRAPHY_STYLE;
            document.head.appendChild(style);
        }
    };

    const collectBibliographyItems = function () {
        const items = {};
        const itemsNodes = document.querySelectorAll(BIB_ITEM_SELECTOR);
        let i;

        for (i = 0; i < itemsNodes.length; i++) {
            const item = itemsNodes[i];
            const tag = getBibliographyTag(item);
            if (!tag) {
                continue;
            }
            items[tag] = normalizeText(item.textContent || '');
            item.parentNode.removeChild(item);
        }

        return items;
    };

    const renderBibliography = function (items) {
        const index = {};
        let count = 0;

        const listContainer = document.querySelector(BIB_LIST_SELECTOR);
        if (!listContainer) {
            return;
        }

        listContainer.innerHTML = '';
        const list = document.createElement('ol');
        listContainer.appendChild(list);

        const citeNodes = document.querySelectorAll(CITE_SELECTOR);
        let i;

        for (i = 0; i < citeNodes.length; i++) {
            const citeNode = citeNodes[i];
            const tag = getCitationTag(citeNode);
            if (!tag) {
                continue;
            }

            if (index[tag] === undefined) {
                index[tag] = ++count;
                const li = document.createElement('li');
                li.id = BIB_PREFIX + tag;
                li.innerHTML = items[tag] || '';
                list.appendChild(li);
            }

            const targetId = BIB_PREFIX + tag;
            const title = items[tag] || '';
            citeNode.outerHTML = formatAnchor(index[tag], targetId, title);
        }
    };

    injectStyle();
    const bibliographyItems = collectBibliographyItems();
    renderBibliography(bibliographyItems);
});
