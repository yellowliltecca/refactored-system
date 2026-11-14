/* HoneyVine storefront interactions.
   To receive real enquiries, set SHOP_EMAIL below or connect the forms to your CRM/API. */
const SHOP_EMAIL = '';

const products = {
  premium: { name: 'Премиальный мёд', weight: '500 г', image: 'assets/product-premium.webp' },
  comb: { name: 'Медовые соты', weight: 'Натуральный продукт', image: 'assets/product-comb.webp' },
  classic: { name: 'Цветочный мёд', weight: '500 г', image: 'assets/product-jar.webp' },
  ginger: { name: 'Мёд с имбирём', weight: '250 г', image: 'assets/product-ginger.webp' },
  gift: { name: 'Медовая коллекция', weight: 'Подарочный набор', image: 'assets/product-gift.webp' },
  acacia: { name: 'Акациевый мёд', weight: '250 г', image: 'assets/product-acacia.webp' },
  raw: { name: 'Raw honey', weight: '500 г', image: 'assets/product-raw.webp' },
  assortment: { name: 'Ассорти мёда', weight: 'Три разных вкуса', image: 'assets/product-set.webp' }
};

const cart = new Map();
try {
  const saved = JSON.parse(localStorage.getItem('honeyvine-cart') || '{}');
  for (const [id, amount] of Object.entries(saved)) {
    if (products[id] && Number.isFinite(+amount) && +amount > 0) {
      cart.set(id, { ...products[id], quantity: Math.min(99, Math.floor(+amount)) });
    }
  }
} catch (_) { /* Browsers can disable storage. The cart still works in memory. */ }
function persistCart() {
  try { localStorage.setItem('honeyvine-cart', JSON.stringify(Object.fromEntries([...cart].map(([id, item]) => [id, item.quantity])))); } catch (_) { }
}
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const cartCount = $('#cartCount');
const drawerCount = $('#drawerCount');
const cartDrawer = $('#cartDrawer');
const drawerBackdrop = $('#drawerBackdrop');
const cartItems = $('#cartItems');
const checkoutButton = $('#checkoutButton');
const orderModalBackdrop = $('#orderModalBackdrop');
const toast = $('#toast');
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function totalItems() {
  return [...cart.values()].reduce((sum, item) => sum + item.quantity, 0);
}

function addToCart(id) {
  const product = products[id];
  if (!product) return;
  const current = cart.get(id) || { ...product, quantity: 0 };
  current.quantity += 1;
  cart.set(id, current);
  renderCart();
  showToast(`${product.name} добавлен в корзину`);
}

function changeQuantity(id, delta) {
  const item = cart.get(id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart.delete(id);
  renderCart();
}

function renderCart() {
  const count = totalItems();
  persistCart();
  cartCount.textContent = count;
  drawerCount.textContent = count;
  checkoutButton.disabled = count === 0;
  if (!count) {
    cartItems.innerHTML = `<div class="cart-empty"><span>✿</span><h3>Пока здесь пусто</h3><p>Добавьте любимый мёд — и он появится здесь.</p><button class="button button--dark" id="continueShopping">Перейти в каталог</button></div>`;
    return;
  }
  cartItems.innerHTML = [...cart.entries()].map(([id, item]) => `
    <article class="cart-line" data-cart-id="${id}">
      <img src="${item.image}" alt="${item.name}">
      <div><h3>${item.name}</h3><small>${item.weight} · цена уточняется</small>
        <div class="quantity-control"><button type="button" data-quantity="-1" aria-label="Уменьшить количество">−</button><span>${item.quantity}</span><button type="button" data-quantity="1" aria-label="Увеличить количество">+</button></div>
      </div>
      <button class="cart-line__remove" type="button" data-remove aria-label="Удалить товар">×</button>
    </article>`).join('');
}

function openCart() {
  cartDrawer.classList.add('is-open');
  drawerBackdrop.classList.add('is-open');
  cartDrawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-locked');
}
function closeCart() {
  cartDrawer.classList.remove('is-open');
  drawerBackdrop.classList.remove('is-open');
  cartDrawer.setAttribute('aria-hidden', 'true');
  if (!orderModalBackdrop.classList.contains('is-open')) document.body.classList.remove('is-locked');
}
function openOrderModal() {
  closeCart();
  orderModalBackdrop.classList.add('is-open');
  document.body.classList.add('is-locked');
  setTimeout(() => $('#orderName')?.focus(), 120);
}
function closeOrderModal() {
  orderModalBackdrop.classList.remove('is-open');
  document.body.classList.remove('is-locked');
}

function currentCartSummary() {
  if (!cart.size) return 'Заявка с сайта HoneyVine';
  return [...cart.values()].map(item => `${item.name} — ${item.quantity} шт. (${item.weight})`).join('\n');
}

function sendLead({ name, phone, comment = '', order = false }) {
  const payload = {
    name,
    phone,
    comment,
    items: order ? currentCartSummary() : 'Запрос на консультацию по ассортименту',
    createdAt: new Date().toISOString()
  };
  try {
    const stored = JSON.parse(localStorage.getItem('honeyvine-leads') || '[]');
    stored.push(payload);
    localStorage.setItem('honeyvine-leads', JSON.stringify(stored));
  } catch (_) { /* Demo mode: storage can be blocked in private browsing. */ }

  if (SHOP_EMAIL.trim()) {
    const subject = encodeURIComponent('Заявка с сайта HoneyVine');
    const body = encodeURIComponent(`Имя: ${name}\nТелефон: ${phone}\nКомментарий: ${comment || '—'}\n\nСостав заказа:\n${payload.items}`);
    window.location.href = `mailto:${SHOP_EMAIL}?subject=${subject}&body=${body}`;
    return 'Открылось письмо с вашей заявкой. Нажмите «Отправить» в почтовом приложении.';
  }
  return 'Заявка сохранена в демо-режиме на этом устройстве. Для реальной отправки подключите email или CRM.';
}

// Product actions and cart controls.
document.addEventListener('click', (event) => {
  const addButton = event.target.closest('[data-add]');
  if (addButton) addToCart(addButton.dataset.add);

  const quantityButton = event.target.closest('[data-quantity]');
  if (quantityButton) {
    const row = quantityButton.closest('[data-cart-id]');
    changeQuantity(row.dataset.cartId, Number(quantityButton.dataset.quantity));
  }

  const removeButton = event.target.closest('[data-remove]');
  if (removeButton) {
    const row = removeButton.closest('[data-cart-id]');
    cart.delete(row.dataset.cartId);
    renderCart();
  }

  if (event.target.closest('#continueShopping')) {
    closeCart();
    $('#products').scrollIntoView({ behavior: 'smooth' });
  }
});

$('#cartButton').addEventListener('click', openCart);
$('#closeCart').addEventListener('click', closeCart);
drawerBackdrop.addEventListener('click', closeCart);
checkoutButton.addEventListener('click', openOrderModal);
$('#closeOrder').addEventListener('click', closeOrderModal);
orderModalBackdrop.addEventListener('click', (event) => {
  if (event.target === orderModalBackdrop) closeOrderModal();
});
$('#accountButton').addEventListener('click', () => $('#contacts').scrollIntoView({ behavior: 'smooth' }));

// Catalogue filters.
$$('.filter-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    $$('.filter-chip').forEach((item) => item.classList.toggle('is-selected', item === chip));
    const filter = chip.dataset.filter;
    $$('.product-card').forEach((card) => {
      card.classList.toggle('is-hidden', filter !== 'all' && card.dataset.category !== filter);
    });
  });
});

// Mobile navigation.
const menuToggle = $('#menuToggle');
const mainNav = $('#mainNav');
menuToggle.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});
$$('.main-nav a').forEach((link) => link.addEventListener('click', () => {
  mainNav.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
}));

// Contact and checkout forms.
$('#contactForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const message = sendLead({ name: form.get('name').trim(), phone: form.get('phone').trim() });
  $('#formMessage').textContent = message;
  event.currentTarget.reset();
});
$('#orderForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const message = sendLead({
    name: form.get('name').trim(),
    phone: form.get('phone').trim(),
    comment: form.get('comment').trim(),
    order: true
  });
  $('#orderMessage').textContent = message;
  cart.clear();
  renderCart();
  event.currentTarget.reset();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeCart();
    closeOrderModal();
    mainNav.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }
});

// Keep the active navigation item in sync with the visible section.
const navLinks = $$('.main-nav a');
const sections = navLinks.map(link => $(link.getAttribute('href'))).filter(Boolean);
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        navLinks.forEach(link => link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`));
      }
    });
  }, { rootMargin: '-35% 0px -55% 0px' });
  sections.forEach(section => observer.observe(section));
}

$('#year').textContent = new Date().getFullYear();
renderCart();

