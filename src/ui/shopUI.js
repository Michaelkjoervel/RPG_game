// LUMENFALL — Shop: Buy/Sell tabs, qty steppers, glim wallet ticker, rotating thanks line.
// showShop(shopId) -> Promise (resolves when the shop closes).
import { bus } from '../core/events.js';
import { G, gainItem, spendItem, gainGlim } from '../core/state.js';
import { input } from '../core/input.js';
import { tween } from '../core/tween.js';
import { pick } from '../core/rng.js';
import { iconCanvas } from './bagUI.js';
import { pushLayer } from './uiStack.js';

const sfx = (name) => bus.emit('ui:sfx', { name });

const THANKS_BUY = [
  'A fine choice, traveler.',
  'May it serve you well on the road.',
  'Come back any time.',
  'The Reach favors the prepared.',
  'Careful out there, now.',
];
const THANKS_SELL = [
  'Every piece has a story — thank you for sharing this one.',
  'I’ll find this a good home.',
  'Fair trade. Glim well earned.',
  'Much obliged.',
];

let _itemsShopsP = null;
const loadItemsShops = () => (_itemsShopsP ??= import('../data/items.js').then((m) => ({ ITEMS: m.ITEMS ?? {}, SHOPS: m.SHOPS ?? {} })).catch(() => ({ ITEMS: {}, SHOPS: {} })));

export function showShop(shopId) {
  return new Promise((resolve) => {
    let mode = 'buy';
    let qty = {};
    let focusIdx = 0; // -1 = Buy/Sell tab row; else index into the list
    let ITEMS = {}, SHOPS = {};
    const unsubs = [];

    const root = document.createElement('div');
    root.className = 'shop-root';
    root.innerHTML = `
      <div class="menu-hub-backdrop"></div>
      <div class="shop-panel panel">
        <div class="shop-header">
          <div class="shop-merchant">
            <div class="shop-merchant-name"></div>
            <div class="shop-merchant-line">Wares of the Reach</div>
          </div>
          <div class="shop-wallet"><span class="sw-val"></span> Glim</div>
        </div>
        <div class="shop-tabs">
          <button class="shop-tab" data-m="buy">Buy</button>
          <button class="shop-tab" data-m="sell">Sell</button>
        </div>
        <div class="shop-list"></div>
        <div class="shop-footer">
          <div class="shop-thanks"></div>
          <button class="btn-ghost shop-close">Leave</button>
        </div>
      </div>
    `;
    document.getElementById('ui-root').appendChild(root);
    const el = {
      name: root.querySelector('.shop-merchant-name'),
      wallet: root.querySelector('.sw-val'),
      list: root.querySelector('.shop-list'),
      thanks: root.querySelector('.shop-thanks'),
    };
    let walletShown = G.glim ?? 0;
    el.wallet.textContent = walletShown;

    function animateWallet(to) {
      const from = walletShown;
      tween({ from, to, dur: 0.5, onUpdate: (v) => { walletShown = v; el.wallet.textContent = Math.round(v); } });
    }

    function stockIds() { return (SHOPS[shopId]?.stock ?? []).filter((id) => ITEMS[id]); }
    function bagSellableIds() { return Object.keys(G.bag || {}).filter((id) => (G.bag[id] ?? 0) > 0 && ITEMS[id]?.kind !== 'key'); }

    function ownedCount(id) { return G.bag?.[id] ?? 0; }
    function priceFor(id) { return mode === 'buy' ? (ITEMS[id]?.price ?? 0) : Math.max(1, Math.floor((ITEMS[id]?.price ?? 0) * 0.5)); }
    function maxQty(id) {
      if (mode === 'sell') return ownedCount(id);
      const price = ITEMS[id]?.price ?? 1;
      return Math.max(0, Math.min(99, Math.floor((G.glim ?? 0) / Math.max(1, price))));
    }

    function ids() { return mode === 'buy' ? stockIds() : bagSellableIds(); }

    function drawList() {
      el.list.innerHTML = '';
      const list = ids();
      root.querySelectorAll('.shop-tab').forEach((b) => b.classList.toggle('focused', focusIdx === -1 && b.dataset.m === mode));
      if (!list.length) { el.list.innerHTML = `<div class="shop-empty">${mode === 'buy' ? 'Nothing in stock right now.' : 'Nothing to sell.'}</div>`; return; }
      if (focusIdx >= list.length) focusIdx = list.length - 1;
      list.forEach((id, i) => {
        const item = ITEMS[id];
        qty[id] = Math.max(1, Math.min(qty[id] ?? 1, Math.max(1, maxQty(id))));
        const row = document.createElement('div');
        row.className = 'shop-item';
        if (i === focusIdx) row.classList.add('focused');
        row.innerHTML = `
          <div class="shop-item-icon"></div>
          <div class="shop-item-body">
            <div class="shop-item-name"></div>
            <div class="shop-item-desc"></div>
            <div class="shop-item-owned"></div>
          </div>
          <div class="qty-stepper">
            <button class="icon-btn qs-dec">-</button>
            <span class="qs-val"></span>
            <button class="icon-btn qs-inc">+</button>
          </div>
          <div class="shop-item-price"></div>
          <button class="btn-gold shop-item-buy"></button>
        `;
        row.querySelector('.shop-item-icon').appendChild(iconCanvas(id, item, 34));
        row.querySelector('.shop-item-name').textContent = item?.name ?? id;
        row.querySelector('.shop-item-desc').textContent = item?.desc ?? '';
        row.querySelector('.shop-item-owned').textContent = `Owned: ${ownedCount(id)}`;
        row.querySelector('.qs-val').textContent = qty[id];
        const cap = maxQty(id);
        row.querySelector('.qs-dec').addEventListener('click', () => { qty[id] = Math.max(1, qty[id] - 1); row.querySelector('.qs-val').textContent = qty[id]; updatePrice(row, id); });
        row.querySelector('.qs-inc').addEventListener('click', () => { qty[id] = Math.min(Math.max(1, cap), qty[id] + 1); row.querySelector('.qs-val').textContent = qty[id]; updatePrice(row, id); });
        const buyBtn = row.querySelector('.shop-item-buy');
        buyBtn.textContent = mode === 'buy' ? 'Buy' : 'Sell';
        buyBtn.disabled = cap <= 0;
        updatePrice(row, id);
        buyBtn.addEventListener('click', () => transact(id));
        el.list.appendChild(row);
      });
      el.list.querySelector('.shop-item.focused')?.scrollIntoView({ block: 'nearest' });
    }

    function updatePrice(row, id) {
      const total = priceFor(id) * (qty[id] ?? 1);
      row.querySelector('.shop-item-price').textContent = `${total}g`;
    }

    function transact(id) {
      const q = qty[id] ?? 1;
      const total = priceFor(id) * q;
      if (mode === 'buy') {
        if ((G.glim ?? 0) < total) { sfx('ui_cancel'); bus.emit('notify', { text: 'Not enough Glim.' }); return; }
        gainItem(id, q);
        gainGlim(-total);
        animateWallet(G.glim);
        el.thanks.textContent = pick(THANKS_BUY);
      } else {
        if (!spendItem(id, q)) return;
        gainGlim(total);
        animateWallet(G.glim);
        el.thanks.textContent = pick(THANKS_SELL);
      }
      sfx('glim');
      qty[id] = 1;
      drawList();
    }

    function setMode(m, { stayOnTabs = false } = {}) {
      mode = m; focusIdx = stayOnTabs ? -1 : 0;
      root.querySelectorAll('.shop-tab').forEach((b) => b.classList.toggle('active', b.dataset.m === m));
      drawList();
    }
    root.querySelectorAll('.shop-tab').forEach((b) => b.addEventListener('click', () => { sfx('ui_move'); setMode(b.dataset.m); }));

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      unsubs.forEach((f) => f());
      popLayer();
      root.classList.add('out');
      sfx('ui_close');
      setTimeout(() => { root.remove(); resolve(); }, 220);
    }
    root.querySelector('.shop-close').addEventListener('click', close);
    root.querySelector('.menu-hub-backdrop').addEventListener('pointerdown', close);
    const popLayer = pushLayer('shop', close);

    // Keyboard/gamepad model: up/down walks tabs-row -> items; on the tab row
    // left/right flips Buy/Sell; on an item left/right steps the qty stepper
    // and confirm buys/sells the focused row.
    function moveFocus(dir) {
      const len = ids().length;
      if (focusIdx === -1) {
        if (dir > 0 && len) { focusIdx = 0; sfx('ui_move'); drawList(); }
        return;
      }
      if (dir < 0 && focusIdx === 0) { focusIdx = -1; sfx('ui_move'); drawList(); return; }
      if (!len) return;
      focusIdx = Math.min(len - 1, Math.max(0, focusIdx + dir));
      sfx('ui_move');
      drawList();
    }

    function stepQty(dir) {
      if (focusIdx === -1) { sfx('ui_move'); setMode(mode === 'buy' ? 'sell' : 'buy', { stayOnTabs: true }); return; }
      const id = ids()[focusIdx];
      if (!id) return;
      const cap = Math.max(1, maxQty(id));
      const next = Math.min(cap, Math.max(1, (qty[id] ?? 1) + dir));
      if (next === qty[id]) return;
      qty[id] = next;
      sfx('ui_move');
      drawList();
    }

    unsubs.push(input.onAction('up', () => moveFocus(-1)));
    unsubs.push(input.onAction('down', () => moveFocus(1)));
    unsubs.push(input.onAction('left', () => stepQty(-1)));
    unsubs.push(input.onAction('right', () => stepQty(1)));
    unsubs.push(input.onAction('confirm', () => {
      if (focusIdx === -1) { if (ids().length) { focusIdx = 0; drawList(); } return; }
      const id = ids()[focusIdx];
      if (id) transact(id);
    }));
    unsubs.push(input.onAction('interact', () => {
      if (focusIdx === -1) return;
      const id = ids()[focusIdx];
      if (id) transact(id);
    }));
    unsubs.push(input.onAction('cancel', close));

    (async () => {
      ({ ITEMS, SHOPS } = await loadItemsShops());
      el.name.textContent = SHOPS[shopId]?.name ?? shopId;
      sfx('ui_open');
      setMode('buy');
    })();
  });
}
