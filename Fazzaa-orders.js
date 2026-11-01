(function () {
  'use strict';

  var config = window.FAZZAA_ORDER_CONFIG || {};
  var cart = [];
  var deliveryFee = null;
  var menuDialog;
  var cartDialog;
  var customerForm;
  var cartItems;
  var cartTotal;
  var cartCount;
  var deliveryMessage;
  var submitButton;
  var messageBox;
  var itemMessage;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function money(amount) {
    return new Intl.NumberFormat('ar-EG').format(amount) + ' ج.م';
  }

  function sortProductOptions(options) {
    var sizeOrder = { '2XL': 0, XL: 1, L: 2, M: 3, S: 4 };
    return options.map(function (option, index) {
      var key = String(option.label).trim().toUpperCase();
      return { option: option, index: index, rank: sizeOrder[key] };
    }).sort(function (left, right) {
      var leftKnown = left.rank !== undefined;
      var rightKnown = right.rank !== undefined;
      if (leftKnown && rightKnown) return left.rank - right.rank;
      if (leftKnown) return -1;
      if (rightKnown) return 1;
      return left.index - right.index;
    }).map(function (entry) {
      return entry.option;
    });
  }

  function closeOnBackdrop(dialog) {
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
  }

  function makeDialog(className, title, closeLabel) {
    var dialog = element('dialog', className);
    var header = element('div', 'order-dialog-head');
    header.appendChild(element('h2', '', title));
    var close = element('button', 'order-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', closeLabel);
    close.addEventListener('click', function () { dialog.close(); });
    header.appendChild(close);
    dialog.appendChild(header);
    document.body.appendChild(dialog);
    closeOnBackdrop(dialog);
    return dialog;
  }

  function getProductOptions(item) {
    var sizes = Array.prototype.slice.call(item.querySelectorAll('.chs .ch'));
    if (sizes.length) {
      return sortProductOptions(sizes.map(function (size) {
        var label = size.querySelector('i').textContent.trim();
        var price = Number(size.textContent.replace(label, '').trim());
        return { label: label, price: price };
      }));
    }

    var price = Number(item.querySelector('.pr').textContent.trim());
    return [{ label: 'default', displayLabel: 'عادي', price: price }];
  }

  function refreshCartCount() {
    cartCount.textContent = cart.reduce(function (sum, line) { return sum + line.quantity; }, 0);
    cartCount.hidden = cart.length === 0;
  }

  function updateTotal() {
    var subtotal = cart.reduce(function (sum, line) {
      return sum + line.unitPrice * line.quantity;
    }, 0);
    var fulfillment = customerForm.elements.fulfillment.value;
    var fee = fulfillment === 'delivery' ? deliveryFee : 0;
    cartTotal.textContent = money(subtotal + (fee || 0));
  }

  function changeQuantity(key, delta) {
    var line = cart.find(function (item) { return item.key === key; });
    if (!line) return;
    if (line.quantity + delta > 99) {
      messageBox.textContent = 'الحد الأقصى لكل حجم هو 99 قطعة.';
      return;
    }
    line.quantity += delta;
    if (line.quantity < 1) {
      cart = cart.filter(function (item) { return item.key !== key; });
    }
    renderCart();
  }

  function renderCart() {
    cartItems.replaceChildren();
    if (!cart.length) {
      cartItems.appendChild(element('p', 'order-empty', 'السلة فارغة. اختاري أصنافك من المنيو.'));
    }

    cart.forEach(function (line) {
      var row = element('div', 'order-cart-row');
      var details = element('div', 'order-line-details');
      details.appendChild(element('strong', '', line.name));
      details.appendChild(element('span', 'order-line-option', line.optionLabel));
      details.appendChild(element('span', 'order-line-price', money(line.unitPrice * line.quantity)));
      row.appendChild(details);

      var controls = element('div', 'order-quantity');
      var less = element('button', '', '−');
      less.type = 'button';
      less.setAttribute('aria-label', 'تقليل الكمية');
      less.addEventListener('click', function () { changeQuantity(line.key, -1); });
      controls.appendChild(less);
      controls.appendChild(element('span', '', String(line.quantity)));
      var more = element('button', '', '+');
      more.type = 'button';
      more.setAttribute('aria-label', 'زيادة الكمية');
      more.addEventListener('click', function () { changeQuantity(line.key, 1); });
      controls.appendChild(more);
      row.appendChild(controls);
      cartItems.appendChild(row);
    });

    refreshCartCount();
    updateTotal();
    submitButton.disabled = !cart.length;
  }

  function addToCart(product, option, quantity) {
    var key = product.id + '|' + option.label;
    var existing = cart.find(function (line) { return line.key === key; });
    if (existing && existing.quantity + quantity > 99) {
      itemMessage.textContent = 'الحد الأقصى لكل حجم هو 99 قطعة.';
      return;
    }
    if (!existing && cart.length >= 30) {
      itemMessage.textContent = 'يمكن إضافة 30 اختيارًا مختلفًا كحد أقصى للطلب الواحد.';
      return;
    }
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({
        key: key,
        productId: product.id,
        name: product.name,
        option: option.label,
        optionLabel: option.displayLabel || option.label,
        unitPrice: option.price,
        quantity: quantity
      });
    }
    renderCart();
    menuDialog.close();
    document.getElementById('order-cart-button').focus();
  }

  function openProductDialog(product) {
    var form = menuDialog.querySelector('form');
    var name = menuDialog.querySelector('.order-product-name');
    var optionWrap = menuDialog.querySelector('.order-option-wrap');
    var optionSelect = menuDialog.querySelector('[name="option"]');
    var quantity = menuDialog.querySelector('[name="quantity"]');
    itemMessage.textContent = '';
    name.textContent = product.name;
    optionSelect.replaceChildren();
    optionWrap.hidden = product.options.length === 1;
    product.options.forEach(function (option) {
      var label = option.displayLabel || option.label;
      var choice = document.createElement('option');
      choice.value = option.label;
      choice.textContent = label + ' — ' + money(option.price);
      optionSelect.appendChild(choice);
    });
    quantity.value = '1';
    form.onsubmit = function (event) {
      event.preventDefault();
      var selected = product.options.find(function (option) {
        return option.label === optionSelect.value;
      });
      var count = Number(quantity.value);
      if (!selected || !Number.isInteger(count) || count < 1 || count > 99) return;
      addToCart(product, selected, count);
    };
    menuDialog.showModal();
  }

  function attachProductButton(item, product) {
    var oldButton = item.querySelector('.order-add');
    if (oldButton) oldButton.remove();
    var button = element('button', 'order-add', '+');
    button.type = 'button';
    button.setAttribute('aria-label', 'إضافة ' + product.name + ' إلى الطلب');
    button.title = 'إضافة إلى الطلب';
    button.addEventListener('click', function () { openProductDialog(product); });
    item.appendChild(button);
  }

  function productFromMenuItem(item, id) {
    return {
      id: id,
      name: item.querySelector('b').textContent.trim(),
      options: getProductOptions(item)
    };
  }

  function renderCatalogProduct(item, catalogItem) {
    var oldDescription = item.querySelector('small');
    var description = oldDescription ? oldDescription.cloneNode(true) : null;
    var prices = sortProductOptions(Object.keys(catalogItem.prices).map(function (label) {
      var value = Number(catalogItem.prices[label]);
      return {
        label: label,
        displayLabel: label === 'default' ? 'عادي' : label,
        price: value
      };
    }));

    item.replaceChildren();
    item.dataset.productId = catalogItem.id;
    item.hidden = !catalogItem.available;
    item.classList.toggle('m', prices.length > 1);
    item.appendChild(element('b', '', catalogItem.name));
    if (prices.length > 1) {
      var sizes = element('div', 'chs');
      prices.forEach(function (option) {
        var choice = element('span', 'ch');
        choice.appendChild(element('i', '', option.displayLabel));
        choice.appendChild(document.createTextNode(String(option.price)));
        sizes.appendChild(choice);
      });
      item.appendChild(sizes);
    } else {
      item.appendChild(element('span', 'dt'));
      item.appendChild(element('span', 'pr', String(prices[0].price)));
    }
    if (description) item.appendChild(description);
    var product = {
      id: catalogItem.id,
      name: catalogItem.name,
      options: prices
    };
    attachProductButton(item, product);
  }

  function getOrCreateCategorySection(category) {
    var existing = Array.prototype.find.call(
      document.querySelectorAll('.paper .sec'),
      function (section) { return section.dataset.nav === category; }
    );
    if (existing) return existing;

    var section = element('section', 'sec');
    var sectionId = 'catalog-' + (window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : Date.now() + '-' + Math.random().toString(36).slice(2));
    section.id = sectionId;
    section.dataset.nav = category;
    section.appendChild(element('h3', '', category));
    document.querySelector('.paper').appendChild(section);

    var nav = document.getElementById('nv');
    if (nav) {
      var link = element('a', '', category);
      link.href = '#' + sectionId;
      link.dataset.id = sectionId;
      nav.appendChild(link);
    }
    return section;
  }

  async function loadMenuCatalog() {
    if (!config.supabaseUrl || !config.supabaseAnonKey) return;
    var url = config.supabaseUrl.replace(/\/$/, '') +
      '/rest/v1/menu_items?select=id,name,category,prices,available&available=eq.true&order=category.asc';
    try {
      var response = await fetch(url, {
        headers: {
          apikey: config.supabaseAnonKey
        }
      });
      if (!response.ok) throw new Error('تعذر تحميل المنيو المحفوظة (' + response.status + ').');
      var catalog = await response.json();
      if (!Array.isArray(catalog)) throw new Error('استجابة قائمة المنيو غير صالحة.');

      var staticItems = new Map();
      document.querySelectorAll('.paper .sec').forEach(function (section) {
        Array.prototype.forEach.call(section.querySelectorAll('.it'), function (item, index) {
          staticItems.set(section.id + '-' + (index + 1), item);
        });
      });

      var seen = new Set();
      catalog.forEach(function (catalogItem) {
        if (!catalogItem.id || !catalogItem.name || !catalogItem.category ||
          !catalogItem.prices || typeof catalogItem.prices !== 'object') return;
        var priceLabels = Object.keys(catalogItem.prices);
        if (!priceLabels.length || priceLabels.length > 10 || priceLabels.some(function (label) {
          var price = catalogItem.prices[label];
          return !label || label.length > 20 || !Number.isSafeInteger(price) || price < 0;
        })) return;
        var item = staticItems.get(catalogItem.id);
        if (item) {
          var targetSection = getOrCreateCategorySection(catalogItem.category);
          if (item.parentElement !== targetSection) targetSection.appendChild(item);
        } else {
          item = element('div', 'it');
          getOrCreateCategorySection(catalogItem.category).appendChild(item);
        }
        renderCatalogProduct(item, catalogItem);
        seen.add(catalogItem.id);
      });

      staticItems.forEach(function (item, id) {
        if (seen.has(id)) return;
        item.hidden = true;
        var button = item.querySelector('.order-add');
        if (button) button.remove();
      });
    } catch (error) {
      console.error(error);
    }
  }

  function setupProductButtons() {
    document.querySelectorAll('.sec').forEach(function (section) {
      Array.prototype.forEach.call(section.querySelectorAll('.it'), function (item, index) {
        var id = item.dataset.productId || section.id + '-' + (index + 1);
        item.dataset.productId = id;
        attachProductButton(item, productFromMenuItem(item, id));
      });
    });
  }

  function makeCustomerForm() {
    var form = document.createElement('form');
    form.className = 'order-checkout';
    form.innerHTML =
      '<label>الاسم<input name="customer_name" autocomplete="name" required maxlength="80"></label>' +
      '<label>رقم الهاتف<input name="phone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="20" placeholder="01xxxxxxxxx"></label>' +
      '<label>طريقة الاستلام<select name="fulfillment" required><option value="pickup">استلام من المحل</option><option value="delivery">توصيل</option></select></label>' +
      '<label class="order-address-wrap" hidden>عنوان التوصيل داخل محافظة دمياط<textarea name="address" rows="2" maxlength="500" placeholder="المنطقة والشارع بالتفصيل داخل دمياط"></textarea></label>' +
      '<label>ملاحظات للمحل <span>(اختياري)</span><textarea name="notes" rows="2" maxlength="500"></textarea></label>' +
      '<label>طريقة الدفع<select name="payment_method"><option value="cash">كاش عند الاستلام</option></select></label>' +
      '<p class="order-payment-note">الدفع الإلكتروني غير متاح حاليًا.</p>';
    return form;
  }

  function setupDialogs() {
    menuDialog = makeDialog('order-dialog', 'اختاري الصنف', 'إغلاق');
    var itemForm = document.createElement('form');
    itemForm.className = 'order-product-form';
    itemForm.appendChild(element('h3', 'order-product-name'));
    var optionLabel = element('label', 'order-option-wrap', 'الحجم والسعر');
    optionLabel.setAttribute('for', 'order-product-option');
    var select = document.createElement('select');
    select.name = 'option';
    select.id = 'order-product-option';
    optionLabel.appendChild(select);
    itemForm.appendChild(optionLabel);
    var quantityLabel = element('label', '', 'الكمية');
    var quantity = document.createElement('input');
    quantity.type = 'number';
    quantity.name = 'quantity';
    quantity.min = '1';
    quantity.max = '99';
    quantity.required = true;
    quantity.value = '1';
    quantityLabel.appendChild(quantity);
    itemForm.appendChild(quantityLabel);
    itemMessage = element('p', 'order-status');
    itemMessage.setAttribute('role', 'status');
    itemForm.appendChild(itemMessage);
    var add = element('button', 'order-primary', 'أضف للسلة');
    add.type = 'submit';
    itemForm.appendChild(add);
    menuDialog.appendChild(itemForm);

    cartDialog = makeDialog('order-dialog order-cart-dialog', 'سلة الطلب', 'إغلاق');
    var body = element('div', 'order-cart-body');
    cartItems = element('div', 'order-cart-items');
    body.appendChild(cartItems);
    var totalRow = element('div', 'order-total-row');
    totalRow.appendChild(element('strong', '', 'الإجمالي'));
    cartTotal = element('strong', 'order-total');
    totalRow.appendChild(cartTotal);
    body.appendChild(totalRow);
    deliveryMessage = element('p', 'order-delivery-message', 'التوصيل داخل محافظة دمياط فقط، برسوم ثابتة 30 جنيه.');
    deliveryMessage.setAttribute('role', 'status');
    body.appendChild(deliveryMessage);
    customerForm = makeCustomerForm();
    customerForm.appendChild(submitButton);
    var deliveryOption = customerForm.elements.fulfillment.querySelector('option[value="delivery"]');
    deliveryOption.disabled = true;
    deliveryOption.textContent = 'توصيل داخل دمياط (30 ج.م)';
    customerForm.elements.fulfillment.addEventListener('change', function () {
      var isDelivery = this.value === 'delivery';
      customerForm.querySelector('.order-address-wrap').hidden = !isDelivery;
      customerForm.elements.address.required = isDelivery;
      updateTotal();
    });
    customerForm.addEventListener('submit', submitOrder);
    body.appendChild(customerForm);
    messageBox = element('p', 'order-status');
    messageBox.setAttribute('role', 'status');
    messageBox.setAttribute('aria-live', 'polite');
    body.appendChild(messageBox);
    cartDialog.appendChild(body);

    var button = element('button', 'order-cart-button');
    button.id = 'order-cart-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'فتح سلة الطلب');
    button.appendChild(element('span', '', 'سلة الطلب'));
    cartCount = element('span', 'order-cart-count', '0');
    cartCount.hidden = true;
    button.appendChild(cartCount);
    button.addEventListener('click', function () {
      renderCart();
      cartDialog.showModal();
    });
    document.body.appendChild(button);
    setupProductButtons();
    loadMenuCatalog();
    renderCart();
  }

  async function loadDeliveryFee() {
    if (!config.supabaseUrl || !config.supabaseAnonKey) return;
    var url = config.supabaseUrl.replace(/\/$/, '') +
      '/rest/v1/shop_settings?id=eq.1&select=delivery_fee';
    try {
      var response = await fetch(url, {
        headers: {
          apikey: config.supabaseAnonKey
        }
      });
      if (!response.ok) throw new Error('تعذر تحميل إعدادات التوصيل (' + response.status + ').');
      var settings = await response.json();
      if (settings.length && Number.isInteger(settings[0].delivery_fee)) {
        deliveryFee = settings[0].delivery_fee;
      }
      var deliveryOption = customerForm.elements.fulfillment.querySelector('option[value="delivery"]');
      deliveryOption.disabled = deliveryFee === null;
      deliveryOption.textContent = deliveryFee === null
        ? 'توصيل (الرسوم غير محددة)'
        : 'توصيل داخل دمياط (' + money(deliveryFee) + ')';
      deliveryMessage.textContent = deliveryFee === null
        ? 'التوصيل غير متاح حتى يحدد المحل رسومه. يمكنك اختيار الاستلام من المحل.'
        : 'التوصيل داخل محافظة دمياط فقط. رسوم التوصيل الثابتة: ' + money(deliveryFee) + '.';
      updateTotal();
    } catch (error) {
      console.error(error);
      deliveryMessage.hidden = false;
      deliveryMessage.textContent = 'تعذر تحميل رسوم التوصيل. حاولي تحديث الصفحة أو اختاري الاستلام من المحل.';
    }
  }

  async function submitOrder(event) {
    event.preventDefault();
    messageBox.textContent = '';
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      messageBox.textContent = 'لم يتم إعداد استقبال الطلبات بعد. يرجى التواصل مع المحل مباشرة.';
      return;
    }
    if (customerForm.elements.fulfillment.value === 'delivery' && deliveryFee === null) {
      messageBox.textContent = 'رسوم التوصيل غير محددة بعد. اختاري الاستلام من المحل.';
      return;
    }

    var payload = {
      customer_name: customerForm.elements.customer_name.value.trim(),
      phone: customerForm.elements.phone.value.trim(),
      fulfillment: customerForm.elements.fulfillment.value,
      address: customerForm.elements.address.value.trim(),
      notes: customerForm.elements.notes.value.trim(),
      payment_method: 'cash',
      items: cart.map(function (line) {
        return {
          product_id: line.productId,
          option_name: line.option,
          quantity: line.quantity
        };
      })
    };
    submitButton.disabled = true;
    submitButton.textContent = 'جارٍ إرسال الطلب...';
    try {
      var response = await fetch(config.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/place_order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.supabaseAnonKey
        },
        body: JSON.stringify({
          p_customer_name: payload.customer_name,
          p_phone: payload.phone,
          p_fulfillment: payload.fulfillment,
          p_address: payload.address,
          p_notes: payload.notes,
          p_payment_method: payload.payment_method,
          p_items: payload.items
        })
      });
      var result = await response.json();
      if (!response.ok) {
        if (result.message && result.message.indexOf('delivery_not_configured') !== -1) {
          throw new Error('رسوم التوصيل لم يحددها المحل بعد. اختاري الاستلام من المحل.');
        }
        if (result.message && (result.message.indexOf('invalid_order') !== -1 ||
          result.message.indexOf('invalid_product') !== -1)) {
          throw new Error('راجعي تفاصيل الطلب أو حدّثي المنيو ثم حاولي مرة أخرى.');
        }
        throw new Error(result.message || 'تعذر إرسال الطلب. حاولي مرة أخرى.');
      }
      if (!result || typeof result.order_number === 'undefined' || typeof result.total !== 'number') {
        throw new Error('استجابة الطلب غير مكتملة. تواصلي مع المحل قبل إعادة المحاولة.');
      }
      cart = [];
      renderCart();
      customerForm.reset();
      customerForm.querySelector('.order-address-wrap').hidden = true;
      customerForm.elements.address.required = false;
      updateTotal();
      messageBox.textContent = 'تم استلام طلبك بنجاح. رقم الطلب: ' + result.order_number +
        '. الإجمالي: ' + money(result.total) + '.';
    } catch (error) {
      messageBox.textContent = error.message || 'تعذر الاتصال بالمحل. حاولي مرة أخرى.';
    } finally {
      submitButton.disabled = !cart.length;
      submitButton.textContent = 'تأكيد وإرسال الطلب';
    }
  }

  function start() {
    submitButton = element('button', 'order-primary', 'تأكيد وإرسال الطلب');
    submitButton.type = 'submit';
    submitButton.disabled = true;
    setupDialogs();
    loadDeliveryFee();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
