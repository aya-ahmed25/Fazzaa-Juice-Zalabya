(function () {
  'use strict';

  var config = window.FAZZAA_ORDER_CONFIG || {};
  var client;
  var loginPanel = document.getElementById('login-panel');
  var adminPanel = document.getElementById('admin-panel');
  var loginMessage = document.getElementById('login-message');
  var ordersMessage = document.getElementById('orders-message');
  var settingsMessage = document.getElementById('settings-message');
  var menuMessage = document.getElementById('menu-message');
  var menuItemsList = document.getElementById('menu-items-list');
  var ordersList = document.getElementById('orders-list');
  var refreshButton = document.getElementById('refresh-orders');
  var refreshMenuButton = document.getElementById('refresh-menu');
  var notificationButton = document.getElementById('enable-notifications');
  var notificationStatus = document.getElementById('notification-status');
  var orderAlert = document.getElementById('order-alert');
  var refreshTimer;
  var orderChannel;
  var loadingOrders = false;
  var ordersInitialized = false;
  var knownOrderIds = new Set();
  var highlightedOrderIds = new Set();
  var audioContext;
  var alertTimer;
  var lastAlertOrderId;
  var pageTitle = document.title;

  var statuses = [
    { value: 'new', label: 'جديد' },
    { value: 'confirmed', label: 'تم التأكيد' },
    { value: 'preparing', label: 'قيد التحضير' },
    { value: 'ready', label: 'جاهز' },
    { value: 'out_for_delivery', label: 'خرج للتوصيل' },
    { value: 'completed', label: 'مكتمل' },
    { value: 'cancelled', label: 'ملغي' }
  ];

  function node(tag, className, text) {
    var item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function money(amount) {
    return new Intl.NumberFormat('ar-EG').format(amount) + ' ج.م';
  }

  function showLogin(message) {
    loginPanel.hidden = false;
    adminPanel.hidden = true;
    loginMessage.textContent = message || '';
    window.clearInterval(refreshTimer);
    if (orderChannel) {
      client.removeChannel(orderChannel);
      orderChannel = null;
    }
    knownOrderIds.clear();
    highlightedOrderIds.clear();
    ordersInitialized = false;
    orderAlert.hidden = true;
    window.clearTimeout(alertTimer);
    document.title = pageTitle;
  }

  function showAdmin() {
    if (!adminPanel.hidden) return;
    loginPanel.hidden = true;
    adminPanel.hidden = false;
    loadDeliverySettings();
    loadMenuItems();
    window.clearInterval(refreshTimer);
    loadOrders().then(function (loaded) {
      if (adminPanel.hidden) return;
      if (loaded) subscribeToNewOrders();
      refreshTimer = window.setInterval(loadOrders, 15000);
    });
  }

  function playOrderSound() {
    if (!audioContext || audioContext.state !== 'running') return;
    var now = audioContext.currentTime;
    [880, 1174].forEach(function (frequency, index) {
      var oscillator = audioContext.createOscillator();
      var gain = audioContext.createGain();
      var start = now + index * 0.16;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.3);
    });
  }

  function announceNewOrder(order) {
    var title = 'طلب جديد #' + order.order_number;
    var details = order.customer_name + ' — ' + money(order.total);
    lastAlertOrderId = order.id;
    document.getElementById('order-alert-title').textContent = title;
    document.getElementById('order-alert-details').textContent = details;
    orderAlert.hidden = false;
    document.title = '🔔 ' + title;
    window.clearTimeout(alertTimer);
    alertTimer = window.setTimeout(function () {
      orderAlert.hidden = true;
      document.title = pageTitle;
    }, 12000);
    playOrderSound();

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        var notification = new Notification('فزاع — ' + title, {
          body: details,
          tag: 'fazzaa-order-' + order.id
        });
        notification.onclick = function () {
          window.focus();
          var card = document.getElementById('order-card-' + order.id);
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          notification.close();
        };
        notification.onerror = function (error) {
          console.error('تعذر عرض إشعار الطلب في المتصفح.', error);
        };
      } catch (error) {
        console.error('تعذر إنشاء إشعار الطلب في المتصفح.', error);
      }
    }
  }

  function subscribeToNewOrders() {
    if (orderChannel || !client) return;
    orderChannel = client.channel('admin-new-orders')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'orders'
      }, function (event) {
        var order = event.new;
        if (!order || knownOrderIds.has(order.id)) return;
        knownOrderIds.add(order.id);
        highlightedOrderIds.add(order.id);
        announceNewOrder(order);
        loadOrders();
      })
      .subscribe(function (status) {
        notificationStatus.textContent = status === 'SUBSCRIBED'
          ? 'التنبيه الفوري متصل. ستظهر الطلبات الجديدة فور وصولها.'
          : 'متابعة الطلبات تلقائيًا كل 15 ثانية. يمكنك تفعيل إشعارات المتصفح من الزر.';
      });
  }

  async function enableNotifications() {
    notificationButton.disabled = true;
    try {
      var AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (AudioContextType) {
        audioContext = audioContext || new AudioContextType();
        await audioContext.resume();
      }

      if (!('Notification' in window)) {
        notificationStatus.textContent = 'المتصفح لا يدعم إشعارات سطح المكتب؛ سيظهر تنبيه داخل الصفحة مع صوت.';
        playOrderSound();
        return;
      }

      var permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission === 'granted') {
        notificationStatus.textContent = 'تم تفعيل صوت وإشعارات الطلبات. اتركي صفحة الإدارة مفتوحة.';
        notificationButton.textContent = 'التنبيهات مفعّلة';
        playOrderSound();
      } else {
        notificationStatus.textContent = 'إشعارات المتصفح غير مسموحة؛ اسمحي بها من إعدادات الموقع لتصلك خارج الصفحة. سيبقى التحديث التلقائي فعالًا.';
      }
    } catch (error) {
      notificationStatus.textContent = 'تعذر تفعيل التنبيهات. راجعي إذن الإشعارات في المتصفح.';
      console.error(error);
    } finally {
      notificationButton.disabled = false;
    }
  }

  function addText(parent, label, value, className) {
    if (!value) return;
    var line = node('p', className);
    var strong = node('strong', '', label + ': ');
    line.appendChild(strong);
    line.appendChild(document.createTextNode(value));
    parent.appendChild(line);
  }

  function makeOrderCard(order, items) {
    var card = node('article', 'order-card');
    card.id = 'order-card-' + order.id;
    card.classList.toggle('order-card-new', highlightedOrderIds.has(order.id));
    var header = node('div', 'order-card-head');
    var identity = node('div');
    identity.appendChild(node('h2', '', 'طلب #' + order.order_number));
    identity.appendChild(node('p', 'order-meta', new Intl.DateTimeFormat('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(order.created_at))));
    header.appendChild(identity);

    var statusSelect = document.createElement('select');
    statusSelect.className = 'order-status-select';
    statusSelect.setAttribute('aria-label', 'حالة الطلب');
    statuses.forEach(function (status) {
      var option = document.createElement('option');
      option.value = status.value;
      option.textContent = status.label;
      option.selected = status.value === order.status;
      statusSelect.appendChild(option);
    });
    statusSelect.addEventListener('change', function () {
      updateOrderStatus(order.id, statusSelect.value, statusSelect);
    });
    header.appendChild(statusSelect);
    card.appendChild(header);

    var body = node('div', 'order-card-body');
    var customer = node('div', 'order-customer');
    customer.appendChild(node('span', '', order.customer_name));
    var phone = node('a', '', order.phone);
    phone.href = 'tel:' + order.phone.replace(/[^\d+]/g, '');
    customer.appendChild(phone);
    customer.appendChild(node('span', '', order.fulfillment === 'delivery' ? 'توصيل' : 'استلام من المحل'));
    customer.appendChild(node('span', '', order.payment_method === 'cash' ? 'كاش' : order.payment_method));
    body.appendChild(customer);

    var itemList = node('ul', 'order-items');
    items.forEach(function (item) {
      var option = item.option_name === 'default' ? '' : ' (' + item.option_name + ')';
      itemList.appendChild(node('li', '', item.product_name + option + ' × ' + item.quantity +
        ' — ' + money(item.line_total)));
    });
    body.appendChild(itemList);
    if (order.fulfillment === 'delivery') {
      addText(body, 'العنوان', order.address, 'order-address');
    }
    addText(body, 'ملاحظات', order.notes, 'order-notes');
    card.appendChild(body);

    var footer = node('div', 'order-card-footer');
    var totalText = order.delivery_fee === null
      ? 'الإجمالي قبل رسوم التوصيل: ' + money(order.subtotal)
      : 'الإجمالي: ' + money(order.total);
    footer.appendChild(node('strong', 'order-total', totalText));
    if (order.status === 'completed') {
      var deleteButton = node('button', 'delete-order-button', 'حذف الطلب المكتمل');
      deleteButton.type = 'button';
      deleteButton.addEventListener('click', function () {
        deleteCompletedOrder(order, deleteButton);
      });
      footer.appendChild(deleteButton);
    }
    card.appendChild(footer);
    return card;
  }

  async function loadOrders() {
    if (!client || adminPanel.hidden || loadingOrders) return false;
    loadingOrders = true;
    refreshButton.disabled = true;
    ordersMessage.textContent = 'جارٍ تحميل الطلبات...';
    try {
      var userResult = await client.auth.getUser();
      if (userResult.error) throw userResult.error;
      var accessResult = await client.from('admin_users')
        .select('user_id')
        .eq('user_id', userResult.data.user.id)
        .maybeSingle();
      if (accessResult.error) throw accessResult.error;
      if (!accessResult.data) {
        showLogin('هذا الحساب غير مصرح له بإدارة الطلبات. أضيفيه إلى قائمة مديري المحل في Supabase.');
        return;
      }

      var result = await client.from('orders')
        .select('id,order_number,created_at,status,customer_name,phone,fulfillment,address,notes,payment_method,subtotal,delivery_fee,total')
        .order('created_at', { ascending: false })
        .limit(100);
      if (result.error) throw result.error;
      var orders = result.data || [];
      var orderItems = [];
      if (orders.length) {
        var itemsResult = await client.from('order_items')
          .select('order_id,product_name,option_name,quantity,unit_price,line_total')
          .in('order_id', orders.map(function (order) { return order.id; }));
        if (itemsResult.error) throw itemsResult.error;
        orderItems = itemsResult.data || [];
      }

      var newOrders = ordersInitialized
        ? orders.filter(function (order) { return !knownOrderIds.has(order.id); })
        : [];
      orders.forEach(function (order) { knownOrderIds.add(order.id); });
      ordersInitialized = true;
      newOrders.forEach(function (order) {
        highlightedOrderIds.add(order.id);
        announceNewOrder(order);
      });

      ordersList.replaceChildren();
      orders.forEach(function (order) {
        var items = orderItems.filter(function (item) { return item.order_id === order.id; });
        ordersList.appendChild(makeOrderCard(order, items));
      });
      if (!orders.length) {
        ordersList.appendChild(node('p', 'empty-orders', 'لا توجد طلبات حتى الآن.'));
      }
      ordersMessage.textContent = 'آخر تحديث: ' + new Intl.DateTimeFormat('ar-EG', {
        timeStyle: 'short'
      }).format(new Date());
      return true;
    } catch (error) {
      ordersMessage.textContent = 'تعذر تحميل الطلبات. تأكدي من صلاحية حساب الإدارة وإعدادات Supabase.';
      console.error(error);
      return false;
    } finally {
      loadingOrders = false;
      refreshButton.disabled = false;
    }
  }

  async function updateOrderStatus(orderId, status, select) {
    select.disabled = true;
    ordersMessage.textContent = '';
    try {
      var result = await client.from('orders').update({ status: status }).eq('id', orderId).select('id').single();
      if (result.error) throw result.error;
      highlightedOrderIds.delete(orderId);
      ordersMessage.textContent = 'تم تحديث حالة الطلب.';
      await loadOrders();
    } catch (error) {
      ordersMessage.textContent = 'تعذر تحديث حالة الطلب. تحققي من صلاحيات الحساب.';
      console.error(error);
      await loadOrders();
    } finally {
      select.disabled = false;
    }
  }

  async function deleteCompletedOrder(order, button) {
    var confirmed = window.confirm('حذف الطلب المكتمل رقم ' + order.order_number +
      ' نهائيًا؟ لا يمكن استرجاعه بعد الحذف.');
    if (!confirmed) return;
    button.disabled = true;
    try {
      var result = await client.from('orders')
        .delete()
        .eq('id', order.id)
        .eq('status', 'completed')
        .select('id')
        .single();
      if (result.error) throw result.error;
      knownOrderIds.delete(order.id);
      highlightedOrderIds.delete(order.id);
      ordersMessage.textContent = 'تم حذف الطلب المكتمل.';
      await loadOrders();
    } catch (error) {
      ordersMessage.textContent = 'تعذر حذف الطلب. شغّلي ترحيل حذف الطلبات المكتملة في Supabase ثم حاولي مرة أخرى.';
      console.error(error);
    } finally {
      button.disabled = false;
    }
  }

  async function loadDeliverySettings() {
    settingsMessage.textContent = '';
    try {
      var result = await client.from('shop_settings').select('delivery_fee').eq('id', 1).single();
      if (result.error) throw result.error;
      var field = document.querySelector('#delivery-settings-form [name="delivery_fee"]');
      field.value = result.data.delivery_fee === null ? '' : result.data.delivery_fee;
    } catch (error) {
      settingsMessage.textContent = 'تعذر تحميل إعدادات التوصيل.';
      console.error(error);
    }
  }

  function parsePrices(value) {
    var lines = value.split(/[\n،,]+/).map(function (line) { return line.trim(); }).filter(Boolean);
    if (!lines.length || lines.length > 10) {
      throw new Error('أدخلي من سعر واحد إلى 10 أسعار.');
    }

    var prices = {};
    lines.forEach(function (line) {
      var parts = line.split(/[:：]/);
      if (parts.length !== 2) throw new Error('اكتبي كل سعر بهذا الشكل: كبير: 55');
      var label = parts[0].trim();
      var priceText = parts[1].trim().replace(/[٠-٩]/g, function (digit) {
        return String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit));
      });
      var price = Number(priceText);
      var key = label === 'عادي' || label === 'سعر واحد' ? 'default' : label;
      if (!label || label.length > 20 || !Number.isInteger(price) || price < 0 ||
        price > 1000000 || Object.prototype.hasOwnProperty.call(prices, key)) {
        throw new Error('راجعي المقاسات والأسعار؛ كل مقاس يجب أن يكون مختلفًا وسعره رقم صحيح.');
      }
      prices[key] = price;
    });
    return prices;
  }

  function formatPrices(prices) {
    return Object.keys(prices).map(function (key) {
      return (key === 'default' ? 'عادي' : key) + ': ' + prices[key];
    }).join('\n');
  }

  function updateCategoryOptions(products) {
    var datalist = document.getElementById('menu-categories');
    var categories = Array.from(new Set(products.map(function (item) { return item.category; })))
      .sort(function (a, b) { return a.localeCompare(b, 'ar'); });
    datalist.replaceChildren();
    categories.forEach(function (category) {
      var option = document.createElement('option');
      option.value = category;
      datalist.appendChild(option);
    });
  }

  function createEditForm(item) {
    var form = node('form', 'menu-edit-form');
    var fields = [
      { name: 'name', label: 'اسم الصنف', value: item.name, type: 'input' },
      { name: 'category', label: 'القسم', value: item.category, type: 'input' },
      { name: 'prices', label: 'الأسعار', value: formatPrices(item.prices), type: 'textarea' }
    ];
    fields.forEach(function (field) {
      var label = node('label', '', field.label);
      var input = field.type === 'textarea'
        ? document.createElement('textarea')
        : document.createElement('input');
      input.name = field.name;
      input.required = true;
      input.value = field.value;
      if (field.type === 'textarea') input.rows = 3;
      else input.maxLength = field.name === 'name' ? 80 : 40;
      label.appendChild(input);
      form.appendChild(label);
    });

    var actions = node('div', 'edit-actions');
    var save = node('button', 'primary-button', 'حفظ التعديلات');
    save.type = 'submit';
    actions.appendChild(save);
    var cancel = node('button', 'secondary-button', 'إلغاء');
    cancel.type = 'button';
    cancel.addEventListener('click', function () { form.hidden = true; });
    actions.appendChild(cancel);
    form.appendChild(actions);
    form.hidden = true;
    form.addEventListener('submit', function (event) {
      saveMenuItem(event, item, save);
    });
    return form;
  }

  function renderMenuItems(products) {
    menuItemsList.replaceChildren();
    if (!products.length) {
      menuItemsList.appendChild(node('p', 'menu-item-empty', 'لا توجد أصناف في المنيو.'));
      updateCategoryOptions(products);
      return;
    }

    products.forEach(function (item) {
      var card = node('article', 'menu-item-card');
      card.dataset.unavailable = String(!item.available);
      var summary = node('div', 'menu-item-summary');
      var details = node('div');
      details.appendChild(node('strong', 'menu-item-name', item.name));
      details.appendChild(node('span', 'menu-item-category', item.category));
      details.appendChild(node('span', 'menu-item-prices', formatPrices(item.prices).replace(/\n/g, ' — ')));
      summary.appendChild(details);

      var actions = node('div', 'menu-item-actions');
      var edit = node('button', 'secondary-button', 'تعديل');
      edit.type = 'button';
      edit.addEventListener('click', function () {
        form.hidden = !form.hidden;
        if (!form.hidden) form.querySelector('input').focus();
      });
      actions.appendChild(edit);
      var availability = node('button', 'secondary-button', item.available ? 'إخفاء من المنيو' : 'إظهار في المنيو');
      availability.type = 'button';
      availability.addEventListener('click', function () {
        setMenuAvailability(item, !item.available, availability);
      });
      actions.appendChild(availability);
      summary.appendChild(actions);
      card.appendChild(summary);

      var form = createEditForm(item);
      card.appendChild(form);
      menuItemsList.appendChild(card);
    });
    updateCategoryOptions(products);
  }

  async function loadMenuItems() {
    if (!client || adminPanel.hidden) return;
    menuMessage.textContent = 'جارٍ تحميل أصناف المنيو...';
    try {
      var result = await client.from('menu_items')
        .select('id,name,category,prices,available')
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (result.error) throw result.error;
      renderMenuItems(result.data || []);
      menuMessage.textContent = 'الأصناف المعروضة محفوظة في منيو الموقع.';
    } catch (error) {
      menuMessage.textContent = 'تعذر تحميل المنيو. تحققي من صلاحيات مدير المحل.';
      console.error(error);
    }
  }

  async function saveMenuItem(event, item, button) {
    event.preventDefault();
    var form = event.currentTarget;
    var name = form.elements.name.value.trim();
    var category = form.elements.category.value.trim();
    button.disabled = true;
    menuMessage.textContent = '';
    try {
      var prices = parsePrices(form.elements.prices.value);
      if (name.length < 2 || !category) {
        throw new Error('اكتبي اسم الصنف والقسم.');
      }
      var result = await client.from('menu_items')
        .update({ name: name, category: category, prices: prices })
        .eq('id', item.id)
        .select('id')
        .single();
      if (result.error) throw result.error;
      menuMessage.textContent = 'تم تحديث الصنف والأسعار. سيظهر التعديل للعملاء بعد تحديث المنيو.';
      await loadMenuItems();
    } catch (error) {
      menuMessage.textContent = error.message || 'تعذر حفظ تعديلات الصنف.';
      console.error(error);
    } finally {
      button.disabled = false;
    }
  }

  async function setMenuAvailability(item, available, button) {
    button.disabled = true;
    try {
      var result = await client.from('menu_items')
        .update({ available: available })
        .eq('id', item.id)
        .select('id')
        .single();
      if (result.error) throw result.error;
      menuMessage.textContent = available ? 'تم إظهار الصنف في المنيو.' : 'تم إخفاء الصنف من المنيو.';
      await loadMenuItems();
    } catch (error) {
      menuMessage.textContent = 'تعذر تغيير ظهور الصنف. تحققي من صلاحيات مدير المحل.';
      console.error(error);
    } finally {
      button.disabled = false;
    }
  }

  async function addMenuItem(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = document.getElementById('add-menu-item');
    var name = form.elements.name.value.trim();
    var category = form.elements.category.value.trim();
    menuMessage.textContent = '';
    button.disabled = true;
    try {
      var prices = parsePrices(form.elements.prices.value);
      if (name.length < 2 || !category) {
        throw new Error('اكتبي اسم الصنف والقسم.');
      }
      var id = 'custom-' + (window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : Date.now() + '-' + Math.random().toString(36).slice(2));
      var result = await client.from('menu_items')
        .insert({ id: id, name: name, category: category, prices: prices, available: true })
        .select('id')
        .single();
      if (result.error) throw result.error;
      form.reset();
      menuMessage.textContent = 'تمت إضافة الصنف للمنيو. سيظهر للعملاء بعد تحديث الصفحة.';
      await loadMenuItems();
    } catch (error) {
      menuMessage.textContent = error.message || 'تعذر إضافة الصنف. حاولي مرة أخرى.';
      console.error(error);
    } finally {
      button.disabled = false;
    }
  }

  async function saveDeliverySettings(event) {
    event.preventDefault();
    settingsMessage.textContent = '';
    var field = event.currentTarget.elements.delivery_fee;
    var fee = field.value === '' ? null : Number(field.value);
    if (fee !== null && (!Number.isInteger(fee) || fee < 0)) {
      settingsMessage.textContent = 'اكتبي رسومًا صحيحة بالجنيه، أو اتركي الحقل فارغًا لإيقاف التوصيل.';
      return;
    }
    try {
      var result = await client.from('shop_settings')
        .update({ delivery_fee: fee })
        .eq('id', 1)
        .select('id')
        .single();
      if (result.error) throw result.error;
      settingsMessage.textContent = fee === null
        ? 'تم إيقاف خيار التوصيل حتى تحديد الرسوم.'
        : 'تم حفظ رسوم التوصيل الموحدة. سيظهر الخيار للعملاء بعد تحديث صفحة المنيو.';
    } catch (error) {
      settingsMessage.textContent = 'تعذر حفظ رسوم التوصيل. تحققي من صلاحيات حساب الإدارة.';
      console.error(error);
    }
  }

  async function initialize() {
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      showLogin('إعداد Supabase غير مكتمل. أضيفي رابط المشروع والمفتاح العام في order-config.js.');
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      showLogin('تعذر تحميل مكتبة لوحة الإدارة. تحققي من اتصال الإنترنت.');
      return;
    }

    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    document.querySelectorAll('#login-form input, #login-form button').forEach(function (field) {
      field.disabled = false;
    });
    document.getElementById('login-form').addEventListener('submit', async function (event) {
      event.preventDefault();
      loginMessage.textContent = 'جارٍ تسجيل الدخول...';
      var form = event.currentTarget;
      try {
        var result = await client.auth.signInWithPassword({
          email: form.elements.email.value.trim(),
          password: form.elements.password.value
        });
        if (result.error) throw result.error;
        showAdmin();
      } catch (error) {
        loginMessage.textContent = 'تعذر تسجيل الدخول. تحققي من البيانات أو من صلاحية حساب الإدارة.';
        console.error(error);
      }
    });

    document.getElementById('delivery-settings-form').addEventListener('submit', saveDeliverySettings);
    refreshButton.addEventListener('click', loadOrders);
    notificationButton.addEventListener('click', enableNotifications);
    document.getElementById('order-alert-close').addEventListener('click', function () {
      orderAlert.hidden = true;
      document.title = pageTitle;
      window.clearTimeout(alertTimer);
    });
    document.getElementById('order-alert-view').addEventListener('click', function () {
      var card = lastAlertOrderId && document.getElementById('order-card-' + lastAlertOrderId);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      orderAlert.hidden = true;
      document.title = pageTitle;
      window.clearTimeout(alertTimer);
    });
    refreshMenuButton.addEventListener('click', loadMenuItems);
    document.getElementById('add-menu-item-form').addEventListener('submit', addMenuItem);
    document.getElementById('sign-out').addEventListener('click', async function () {
      var result = await client.auth.signOut();
      if (result.error) {
        ordersMessage.textContent = 'تعذر تسجيل الخروج.';
        console.error(result.error);
        return;
      }
      showLogin('');
    });

    client.auth.onAuthStateChange(function (_event, session) {
      if (session) showAdmin();
      else showLogin('');
    });
    var sessionResult = await client.auth.getSession();
    if (sessionResult.error) {
      showLogin('تعذر التحقق من جلسة الدخول.');
      console.error(sessionResult.error);
      return;
    }
    if (sessionResult.data.session) showAdmin();
    else showLogin('');
  }

  initialize();
})();
