'use strict';
(() => {
  const catalog = window.OpenAgixCatalog;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const EMAIL = 'samir.tan.it@gmail.com';
  const WECHAT = 'samirtan';
  const DRAFT_KEY = 'openagix-inquiry-v1';
  const trainingPlans = ['尚未确定', '认知与场景工作坊 · 2 万元起', '专题实战训练营 · 3.5 万元起', '企业定制工作坊 · 5 万元'];
  const fields = ['type', 'course', 'plan', 'company', 'goals', 'city', 'date', 'people', 'budget', 'contactName', 'contactMethod', 'contactValue'];
  const form = $('#inquiry-form');
  const result = $('#brief-result');
  const brief = $('#brief-text');
  const dialogs = $$('dialog');
  let step = 1;
  let selectedService = null;
  let detailOrigin = null;
  let toastTimer;
  let briefSubject = '';

  function announce(message) {
    $('#site-status').textContent = message;
    $('#site-status').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#site-status').classList.remove('visible'), 5000);
  }
  function openDialog(dialog) {
    dialogs.forEach(other => { if (other.open && other !== dialog) other.close(); });
    closeMenu();
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('modal-open');
    dialog.scrollTop = 0;
  }
  dialogs.forEach(dialog => {
    dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      if (!dialogs.some(item => item.open)) document.body.classList.remove('modal-open');
      if (dialog.id === 'detail-dialog' && location.hash.startsWith('#service/')) {
        history.replaceState(null, '', location.pathname + location.search + detailOrigin);
      }
    });
    dialog.addEventListener('click', event => {
      const r = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close();
    });
  });

  const menu = $('.menu-toggle');
  const navigation = $('#navigation');
  function closeMenu() {
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', '打开导航');
    navigation.classList.remove('open');
  }
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? '关闭导航' : '打开导航');
    navigation.classList.toggle('open', open);
  });
  navigation.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('click', event => { if (!event.target.closest('.header')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  matchMedia('(min-width:851px)').addEventListener('change', closeMenu);
  $('#year').textContent = new Date().getFullYear();
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        $$('#navigation a').forEach(link => {
          if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      }
    }, { rootMargin: '-10% 0px -65% 0px' });
    $$('#navigation a').forEach(link => { const target = $(link.hash); if (target) observer.observe(target); });
  }

  function options(select, values, previous) {
    select.replaceChildren(...values.map(value => new Option(value, value)));
    if (values.includes(previous)) select.value = previous;
  }
  function updatePlans(preferred) {
    const type = form.elements.type.value;
    const service = catalog.find(item => item.type === type && item.title === form.elements.course.value);
    const plans = type === 'training' ? trainingPlans : type === 'technology' ? ['技术项目 · 按需求报价'] : ['尚未确定', ...catalog.filter(item => item.type === 'advisory').map(item => item.plan)];
    options(form.elements.plan, plans, preferred || service?.plan);
    $('#service-context').textContent = service ? `${service.price}。${service.boundary}` : type === 'training' ? '单场 2–5 万元，100 人以内；实操建议 20–40 人。' : '具体服务范围、合作方式与费用沟通确认。';
  }
  function updateType(title, plan) {
    const previous = title || form.elements.course.value;
    const type = form.elements.type.value;
    options(form.elements.course, ['尚未确定，希望获得建议', ...catalog.filter(item => item.type === type).map(item => item.title)], previous);
    updatePlans(plan);
    const training = type === 'training';
    $('#people-label').hidden = !training;
    form.elements.people.disabled = !training;
    $('#course-label').firstChild.textContent = type === 'advisory' ? '顾问方向' : '关注方向';
  }
  function setStep(next) {
    step = next;
    result.hidden = next !== 3;
    form.hidden = next === 3;
    $$('[data-step]').forEach(item => { item.hidden = Number(item.dataset.step) !== next; });
    $$('.wizard-progress li').forEach((item, index) => {
      if (index + 1 === next) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      item.classList.toggle('complete', index + 1 < next);
    });
    $('#inquiry-dialog').scrollTop = 0;
  }
  function openInquiry(context = {}) {
    // Generic reopen preserves work; a specific service updates only service selection.
    const service = catalog.find(item => (context.course && item.title === context.course) || (context.plan && item.plan === context.plan));
    if (service) form.elements.type.value = service.type;
    else if (context.plan && trainingPlans.includes(context.plan)) form.elements.type.value = 'training';
    if (service || context.course || context.plan) updateType(service?.title || context.course, context.plan);
    if (context.people) form.elements.people.value = context.people;
    setStep(1);
    refreshDraftNotice();
    openDialog($('#inquiry-dialog'));
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-inquiry]');
    if (button) openInquiry({ course: button.dataset.course, plan: button.dataset.plan, people: button.dataset.people });
  });
  form.elements.type.addEventListener('change', () => updateType());
  form.elements.course.addEventListener('change', () => updatePlans());
  form.elements.plan.addEventListener('change', () => {
    const service = catalog.find(item => item.plan === form.elements.plan.value);
    if (service) { form.elements.course.value = service.title; $('#service-context').textContent = `${service.price}。${service.boundary}`; }
  });
  $('#next-step').addEventListener('click', () => { setStep(2); form.elements.company.focus(); });
  $('#previous-step').addEventListener('click', () => { setStep(1); form.elements.type.focus(); });
  function localDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  form.elements.date.min = localDate();
  function updateContact() {
    const input = form.elements.contactValue;
    input.type = form.elements.contactMethod.value === 'email' ? 'email' : 'text';
    input.placeholder = input.type === 'email' ? '填写邮箱（选填）' : '填写微信号（选填）';
    input.setCustomValidity('');
    input.removeAttribute('aria-invalid');
    $('#contactValue-error').textContent = '';
  }
  form.elements.contactMethod.addEventListener('change', updateContact);
  function validateInput(input) {
    input.setCustomValidity('');
    let error = '';
    if (input.required && !input.value.trim()) error = input.name === 'company' ? '请填写企业或团队名称。' : '请简要说明希望解决的业务问题。';
    else if (input.name === 'date' && input.value && input.value < localDate()) error = '请选择今天或之后的日期。';
    else if (input.name === 'people' && input.value && (!Number.isInteger(Number(input.value)) || Number(input.value) < 1 || Number(input.value) > 100)) error = '单场人数请填写 1–100 的整数；更多人数可在业务问题中说明分场需求。';
    else if (input.validity.typeMismatch) error = '请填写有效的邮箱地址。';
    else if (!input.validity.valid) error = '请检查填写内容。';
    input.setCustomValidity(error);
    if (error) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    const note = $(`#${input.name}-error`);
    if (note) note.textContent = error;
    return !error;
  }
  form.addEventListener('input', event => {
    if (event.target.hasAttribute('aria-invalid')) validateInput(event.target);
    $('#form-status').textContent = '';
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (step !== 2) { setStep(2); form.elements.company.focus(); return; }
    const inputs = [...form.querySelectorAll('[data-step="2"] input, [data-step="2"] textarea')].filter(input => !input.disabled);
    const invalid = inputs.filter(input => !validateInput(input));
    if (invalid.length) {
      $('#form-status').textContent = `还有 ${invalid.length} 项需要检查，请查看填写提示。`;
      const detail = invalid[0].closest('details'); if (detail) detail.open = true;
      invalid[0].focus(); return;
    }
    const values = Object.fromEntries(new FormData(form));
    const kind = { training: '培训与分享', technology: '技术项目', advisory: '商业顾问' }[values.type];
    const lines = [
      `分微未来智能 · ${kind}需求单`, '',
      `企业 / 团队：${values.company.trim()}`, `合作类型：${kind}`, `关注方向：${values.course}`, `意向方案：${values.plan}`,
      `合作城市 / 形式：${values.city}`, `期望开始日期（待确认）：${values.date || '待确认'}`,
      ...(values.type === 'training' ? [`单场预计人数：${values.people || '待确认'}`] : []),
      `预算范围：${values.budget}`, `业务问题：${values.goals.trim()}`,
      ...(values.contactName.trim() ? [`联系人：${values.contactName.trim()}`] : []),
      ...(values.contactValue.trim() ? [`${values.contactMethod === 'email' ? '联系邮箱' : '联系微信'}：${values.contactValue.trim()}`] : []),
      '', `业务联系：微信 ${WECHAT} / 邮箱 ${EMAIL}`, '官方网站：https://openagix.com',
      '此需求单尚未发送，也不代表预约或报价已确认。',
      values.type === 'advisory' ? '服务范围、成果、频次与费用以书面约定为准；比例计费需明确基数、归因与结算条件。' : values.type === 'technology' ? '技术路线、数据条件、交付范围与报价待沟通确认。' : '培训地点、时长、人数、内容与最终报价待沟通确认。'
    ];
    brief.value = lines.join('\n');
    briefSubject = `分微未来智能${kind}咨询 · ${values.company.trim()}`;
    $('#email-brief').href = `mailto:${EMAIL}?subject=${encodeURIComponent(briefSubject)}&body=${encodeURIComponent(brief.value)}`;
    $('#copy-status').textContent = '';
    setStep(3);
    brief.focus();
  });
  $('#edit-brief').addEventListener('click', () => { setStep(2); form.elements.company.focus(); });
  async function copyText(value) {
    try { await navigator.clipboard.writeText(value); return true; } catch { return false; }
  }
  $('#copy-brief').addEventListener('click', async () => {
    const copied = await copyText(brief.value);
    if (!copied) { brief.focus(); brief.select(); }
    $('#copy-status').textContent = copied ? '需求单已复制，可发送至微信或邮箱。' : '未能自动复制，文本已选中，请手动复制或下载需求单。';
  });
  $('#download-brief').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob(['\ufeff', brief.value], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = '分微未来智能-合作需求单.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#copy-status').textContent = '已发起文本下载；可从浏览器下载记录中查看。';
  });
  $('#print-brief').addEventListener('click', () => {
    const title = document.createElement('h1'); title.textContent = briefSubject;
    const content = document.createElement('pre'); content.textContent = brief.value;
    $('#print-area').replaceChildren(title, content);
    window.print();
  });
  document.addEventListener('click', async event => {
    if (!event.target.closest('[data-copy-wechat]')) return;
    const copied = await copyText(WECHAT);
    const text = copied ? `微信号 ${WECHAT} 已复制，请在微信中搜索添加。` : `未能自动复制，请在微信中搜索：${WECHAT}`;
    $('#contact-status').textContent = text; announce(text);
  });

  function readDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (!draft) return null;
      if (draft.version !== 1 || !draft.values || typeof draft.values !== 'object' || !Number.isFinite(draft.savedAt) || draft.savedAt > Date.now() || Date.now() - draft.savedAt > 7 * 86400000) {
        localStorage.removeItem(DRAFT_KEY); return null;
      }
      // Restore renamed services without discarding the visitor's saved inquiry.
      for (const service of catalog.filter(item => item.previousTitle)) {
        if (draft.values.course === service.previousTitle) draft.values.course = service.title;
        if (typeof draft.values.plan === 'string' && draft.values.plan.startsWith(`${service.previousTitle} · `)) draft.values.plan = service.plan;
      }
      return draft;
    } catch { return null; }
  }
  function refreshDraftNotice() {
    const draft = readDraft();
    $('#draft-notice').hidden = !draft;
    if (draft) $('#draft-description').textContent = `本设备有一份草稿 · ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(draft.savedAt)}`;
  }
  $('#save-draft').addEventListener('click', () => {
    try {
      const values = {};
      for (const name of fields) values[name] = form.elements[name].value;
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), values }));
      $('#form-status').textContent = '草稿已保存到本设备，7 天内可恢复。共享设备使用后请删除草稿。'; refreshDraftNotice();
    } catch { $('#form-status').textContent = '此浏览器无法保存草稿。你仍可继续填写并下载需求单。'; }
  });
  $('#restore-draft').addEventListener('click', () => {
    const draft = readDraft();
    if (!draft) { refreshDraftNotice(); $('#form-status').textContent = '草稿已过期或不可用，请继续填写。'; return; }
    const values = draft.values;
    if (['training', 'technology', 'advisory'].includes(values.type)) form.elements.type.value = values.type;
    updateType(values.course, values.plan);
    for (const name of fields.filter(name => !['type', 'course', 'plan'].includes(name))) {
      const input = form.elements[name]; const value = values[name];
      if (typeof value !== 'string') continue;
      if (input.tagName === 'SELECT' && ![...input.options].some(option => option.value === value)) continue;
      input.value = value.slice(0, input.maxLength > 0 ? input.maxLength : 1500);
      input.setCustomValidity(''); input.removeAttribute('aria-invalid');
    }
    $$('.field-error').forEach(note => { note.textContent = ''; });
    updateContact(); setStep(2); $('#form-status').textContent = '已恢复保存的内容，请确认信息后生成需求单。';
  });
  $('#delete-draft').addEventListener('click', () => {
    try { localStorage.removeItem(DRAFT_KEY); refreshDraftNotice(); $('#form-status').textContent = '已删除本设备中的草稿，当前填写内容保留。'; }
    catch { $('#form-status').textContent = '未能删除草稿，请检查浏览器存储设置。'; }
  });

  // Catalog detail pages share only public service identifiers, never inquiry data.
  function listContent(selector, values) {
    $(selector).replaceChildren(...values.map(value => { const li = document.createElement('li'); li.textContent = value; return li; }));
  }
  function showDetail(service, syncUrl = true) {
    selectedService = service;
    $('#detail-group').textContent = `${service.group} / SERVICE DETAILS`;
    $('#detail-title').textContent = service.title; $('#detail-price').textContent = service.price;
    $('#detail-audience').textContent = `适合：${service.audience}`;
    listContent('#detail-modules', service.modules); listContent('#detail-outcomes', service.outcomes);
    $('#detail-preparation').textContent = service.preparation;
    $('#detail-boundary').textContent = service.boundary;
    $('#detail-status').textContent = ''; $('#share-fallback').hidden = true;
    if (!location.hash.startsWith('#service/')) detailOrigin = location.hash || '';
    if (syncUrl && location.hash !== `#service/${service.id}`) history.pushState(null, '', `#service/${service.id}`);
    openDialog($('#detail-dialog'));
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-detail-title]');
    if (!button) return;
    const service = catalog.find(item => item.title === button.dataset.detailTitle);
    if (service) showDetail(service);
  });
  $('#detail-inquiry').addEventListener('click', () => {
    if (selectedService) openInquiry({ course: selectedService.title, plan: selectedService.plan });
  });
  $('#share-detail').addEventListener('click', async () => {
    if (!selectedService) return;
    const url = `https://openagix.com/#service/${selectedService.id}`;
    const copied = await copyText(url);
    $('#detail-status').textContent = copied ? '业务链接已复制。' : '未能自动复制，可在下方手动复制链接。';
    $('#share-fallback').hidden = copied;
    if (!copied) { $('#share-url').value = url; $('#share-url').focus(); $('#share-url').select(); }
  });
  function followServiceHash() {
    if (!location.hash.startsWith('#service/')) { if ($('#detail-dialog').open) $('#detail-dialog').close(); return; }
    const service = catalog.find(item => item.id === location.hash.slice(9));
    if (service) showDetail(service, false);
  }
  window.addEventListener('hashchange', followServiceHash);
  window.addEventListener('popstate', followServiceHash);
  detailOrigin = ''; followServiceHash();

  // Search and category filters retain the static content as a no-JavaScript fallback.
  const courseCards = $$('.program-card, .learning-grid article');
  let activeFilter = 'all';
  const normalized = value => value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  function filterCourses() {
    const query = normalized($('#course-search').value);
    let total = 0;
    for (const card of courseCards) {
      const service = catalog.find(item => item.title === card.querySelector('h3').textContent);
      const matches = service && (activeFilter === 'all' || service.group === activeFilter) && normalized([service.title, service.audience, ...service.modules, ...service.outcomes].join(' ')).includes(query);
      card.hidden = !matches; if (matches) total++;
    }
    $('#learning-heading').hidden = !$$('.learning-grid article').some(card => !card.hidden);
    $('.learning-grid').hidden = $('#learning-heading').hidden;
    $('.program-grid').hidden = !$$('.program-card').some(card => !card.hidden);
    $('#course-count').textContent = `找到 ${total} 个主题`;
    $('#course-empty').hidden = total > 0;
  }
  $('#course-search').addEventListener('input', filterCourses);
  $$('[data-filter]').forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    $$('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    filterCourses();
  }));
  $('#reset-search').addEventListener('click', () => {
    $('#course-search').value = ''; activeFilter = 'all';
    $$('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.filter === 'all')));
    filterCourses(); $('#course-search').focus();
  });
  $('#course-discovery').hidden = false;

  $('#plan-finder-form').addEventListener('submit', event => {
    event.preventDefault();
    const size = Number($('#finder-size').value);
    if (!Number.isInteger(size) || size < 1 || size > 100) return;
    const goal = $('#finder-goal').value;
    const audience = $('#finder-audience').value;
    const plan = goal === 'business' ? trainingPlans[3] : goal === 'prototype' ? trainingPlans[2] : trainingPlans[1];
    const reasons = [goal === 'business' ? '你希望围绕明确业务或组织问题推进，适合先做课前调研与模块共创。' : goal === 'prototype' ? '你希望动手完成原型，适合聚焦一个专题并安排实操与复盘。' : '你希望建立认知与发现机会，适合以案例、演示和业务讨论开始。'];
    if (size > 40 && goal !== 'awareness') reasons.push('本场超过 40 人，建议沟通分组辅导或分场安排，以保障实操交流。');
    if (audience === 'leaders' && goal === 'prototype') reasons.push('管理者参加实操时，建议业务与技术骨干共同参与。');
    if (audience === 'builders' && goal === 'awareness') reasons.push('如团队已有基础，可进一步沟通是否升级为专题实战。');
    $('#finder-title').textContent = plan;
    $('#finder-reason').textContent = reasons.join('');
    $('#finder-inquiry').dataset.plan = plan; $('#finder-inquiry').dataset.people = String(size);
    $('#finder-result').hidden = false;
  });
  ['#finder-goal', '#finder-audience', '#finder-size'].forEach(selector => $(selector).addEventListener('input', () => { $('#finder-result').hidden = true; }));
  $('#compare-plans').addEventListener('click', () => openDialog($('#compare-dialog')));
  $('#plan-tools').hidden = false;

  const faqItems = $$('#faq-list details');
  $('#faq-search').addEventListener('input', () => {
    const query = normalized($('#faq-search').value);
    let count = 0;
    faqItems.forEach(item => { item.hidden = !normalized(item.textContent).includes(query); if (!item.hidden) count++; });
    $('#faq-status').textContent = count ? `找到 ${count} 个相关问题` : '没有匹配问题，可通过微信或邮件进一步沟通。';
  });
  $('#faq-search-label').hidden = false;
  $('.mobile-contact').hidden = false;
  updateType();
})();
