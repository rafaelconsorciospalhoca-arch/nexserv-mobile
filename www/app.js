const API_BASE = window.CHAMA_CONFIG?.apiBase || '';

// ---------- Rastreamento (GA4, GTM, Meta Pixel, TikTok Pixel, script livre) ----------
// Configurado no admin (aba Rastreamento) e injetado aqui assim que o app
// carrega — vale pra visitante anônimo (tela de login) e usuário logado.
// Best-effort: qualquer falha aqui não pode travar o carregamento do app.
function injectScriptTag(src) {
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  document.head.appendChild(s);
}

function injectInlineScript(code) {
  const s = document.createElement('script');
  s.textContent = code;
  document.head.appendChild(s);
}

function injectHTMLWithScripts(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  Array.from(container.childNodes).forEach((node) => {
    if (node.nodeName === 'SCRIPT') {
      const s = document.createElement('script');
      Array.from(node.attributes || []).forEach((attr) => s.setAttribute(attr.name, attr.value));
      s.textContent = node.textContent;
      document.head.appendChild(s);
    } else {
      document.head.appendChild(node);
    }
  });
}

(async function loadTrackingScripts() {
  try {
    const res = await fetch(`${API_BASE}/tracking-config`);
    if (!res.ok) return;
    const cfg = await res.json();

    if (cfg.gaMeasurementId) {
      injectScriptTag(`https://www.googletagmanager.com/gtag/js?id=${cfg.gaMeasurementId}`);
      injectInlineScript(`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${cfg.gaMeasurementId}');`);
    }
    if (cfg.gtmContainerId) {
      injectInlineScript(`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${cfg.gtmContainerId}');`);
    }
    if (cfg.fbPixelId) {
      // Correspondência avançada manual: se o visitante já está logado nesse
      // momento (retornando ao app), manda e-mail/telefone dele como 3º
      // parâmetro do fbq('init', ...) — o Pixel faz o hash SHA-256 sozinho
      // no navegador antes de mandar pra Meta, nunca em texto puro. Pra
      // visitante anônimo (tela de login/cadastro) não tem o que mandar
      // aqui — esse caso fica coberto pela correspondência avançada
      // AUTOMÁTICA (ativada no Gerenciador de Eventos da Meta, sem precisar
      // de código: ela lê os campos de e-mail/telefone dos formulários,
      // tipo o de cadastro, na hora do envio).
      const advancedMatching = {};
      if (user?.email) advancedMatching.em = user.email.toLowerCase().trim();
      if (user?.phone) advancedMatching.ph = `55${user.phone.replace(/\D/g, '')}`;
      injectInlineScript(`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${cfg.fbPixelId}',${JSON.stringify(advancedMatching)});fbq('track','PageView');`);
    }
    if (cfg.tiktokPixelId) {
      injectInlineScript(`!function (w, d, t) {w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${cfg.tiktokPixelId}');ttq.page();}(window,document,'ttq');`);
    }
    if (cfg.customTrackingCode) {
      injectHTMLWithScripts(cfg.customTrackingCode);
    }
  } catch {
    // rastreamento é best-effort, nunca deve travar o carregamento do app
  }
})();

// Dispara um evento de conversão pra todo rastreamento configurado (Meta
// Pixel, GA4, GTM) — chamado nos pontos que realmente importam pra anúncio:
// cadastro concluído, entrada na lista de espera, pagamento confirmado.
function trackConversionEvent(eventName, params = {}) {
  try {
    if (typeof window.fbq === 'function') window.fbq('track', eventName, params);
    if (typeof window.gtag === 'function') window.gtag('event', eventName, params);
    if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event: eventName, ...params });
  } catch {
    // rastreamento é best-effort, nunca deve travar a ação principal
  }
}

let token = localStorage.getItem('chama_token');
let user = JSON.parse(localStorage.getItem('chama_user') || 'null');
// Navegação livre: visitante sem conta entra direto na home igual um
// cliente logado (mesmas telas de categorias/prestadores), sem token nem
// dado salvo no localStorage — só pra evitar checagem de "user &&" espalhada
// pelo app inteiro. Cadastro só é cobrado ao tentar pedir orçamento (ver
// openRequestForm) ou entrar numa aba que precisa de conta (ver setTab).
const GUEST_USER = { id: null, role: 'client', name: 'Visitante' };
const GUEST_GATED_TABS = new Set(['my-requests', 'messages', 'profile']);
let providerAwaitingExpansion = false;
let selectedRole = 'client';
let payMethod = 'pix';
let selectedInstallments = 1;
let installmentsEligible = false;
const MIN_INSTALLMENT_AMOUNT = 300;
const MIN_SERVICE_VALUE = 100;
let jobsTab = 'active';
let messagesTab = 'all';
let currentChat = null; // { requestId, otherName, otherId }
let chatSocket = null;
let renderedMessageIds = new Set();
let lastPaymentContext = null; // { requestId, otherId, otherName }

// ---------- Contador de visitantes (métrica própria, não é rastreamento de
// terceiros — sem IP nem dado pessoal, só um ID anônimo salvo no navegador) ----------
function getOrCreateVisitorId() {
  let id = localStorage.getItem('chama_visitor_id');
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem('chama_visitor_id', id);
  }
  return id;
}

function trackPath(path) {
  try {
    fetch(`${API_BASE}/track/pageview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ visitorId: getOrCreateVisitorId(), path, referrer: document.referrer || null }),
    }).catch(() => {});
  } catch {
    // best-effort, nunca deve travar a navegação
  }
}

(function trackPageview() {
  trackPath(window.location.pathname);
})();

// Registra cada troca de aba/tela dentro do app (antes só entrava o
// carregamento inicial da página — como é uma SPA, isso deixava invisível
// qual tela cada tipo de usuário mais usa depois de entrar). Path fica tipo
// "/app/tab/provider-jobs" pra aparecer separado do "/app/" na aba Métricas.
function trackScreen(id) {
  trackPath(`/app/tab/${id}`);
}

const money = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const dateFmt = (v) => new Date(v).toLocaleDateString('pt-BR');
const timeFmt = (v) => new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const normalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const esc = (s) => (s || '').replace(/</g, '&lt;');

function avatarDataUri(name) {
  const txt = initials(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" rx="50" fill="#FDEAD6"/><text x="50" y="58" font-family="Inter,sans-serif" font-size="38" font-weight="700" fill="#D96A0F" text-anchor="middle">${txt}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
// Tentativa anterior: reescrever pro proxy /img/ do backend pra contornar o
// cache-control quebrado do Supabase. Revertido — o Supabase serve via CDN
// global (Cloudflare, perto de qualquer lugar), e o Railway é servidor único
// (uma região só). Trocar "CDN rápido sem cache" por "servidor mais longe
// com cache" piorou o tempo de carregamento na prática (testado com o
// usuário real: ficou mais lento). Volta a bater direto no Supabase — o
// cache do lado do navegador (ver sw.js) continua tentando ajudar sem esse
// custo extra de rede.
function imgProxy(url) {
  return url;
}
function avatarSrc(u) {
  const photo = u?.photoUrl || u?.photo_url;
  return photo ? imgProxy(photo) : avatarDataUri(u?.name);
}
function avatarBoxHTML(name, photoUrl) {
  return photoUrl
    ? `<img src="${imgProxy(photoUrl)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`
    : initials(name);
}

const statusLabels = {
  pending: 'Aguardando propostas', accepted: 'Aceito', in_progress: 'Em andamento',
  awaiting_approval: 'Aguardando sua aprovação', done: 'Concluído', canceled: 'Cancelado',
  rejected: 'Recusada',
};

const categoryIcon = {
  'Reformas & Construção': '🏗️', 'Eletricista': '💡', 'Hidráulica': '🚿', 'Diarista/Limpeza': '🧽', 'Ar-Condicionado': '❄️',
  'Beleza & Bem-estar': '💇', 'Aulas & Cursos': '📚', 'Tecnologia': '💻', 'Fretes & Transporte': '🚚', 'Jardinagem': '🌿',
  'Eventos': '🎉', 'Assistência Técnica': '🛠️', 'Pintura': '🎨', 'Marcenaria & Móveis': '🪚', 'Serralheria': '🔩',
  'Vidraçaria': '🪟', 'Gesso & Drywall': '🧱', 'Pisos & Azulejos': '🔲', 'Dedetização': '🐜', 'Piscinas': '🏊',
  'Serviços Automotivos': '🚗', 'Guincho & Reboque': '🚛', 'Chaveiro': '🔑', 'Costura & Reparos': '🧵', 'Pet Care': '🐾',
  'Babá & Cuidadores': '🍼', 'Cuidados a Idosos': '🧓', 'Saúde & Terapias': '💆', 'Fotografia & Vídeo': '📷', 'Música & DJ': '🎧',
  'Buffet & Gastronomia': '🍽️', 'Decoração': '🖼️', 'Design & Publicidade': '🎯', 'Marketing Digital': '📈', 'Contabilidade': '📊',
  'Jurídico': '⚖️', 'Consultoria': '💼', 'Traduções': '🌐', 'Alfaiataria': '🪡', 'Mudanças': '📦',
  'Segurança & CFTV': '📹', 'Energia Solar': '☀️', 'Personal Trainer': '🏋️', 'Montagem de Móveis': '🔧',
  'Manicure a domicílio': '💅', 'Fretes e Mudanças': '📦', 'Cuidados com Pets': '🐕', 'Pedreiro': '👷',
  'Guincho': '🚨', 'Viagens': '🧳', 'Criar site e Apps': '🌐', 'Técnico de Informática': '🖥️',
  'Motorista de App': '🚕', 'Freelancer': '🧑‍💻', 'Motoboy': '🛵', 'Marido de Aluguel': '🧰',
};
const catBg = ['#FDEAD6', '#DBEAFE', '#DCFCE7', '#EDE9FE', '#FEF3C7', '#FEE2E2'];
const catFg = ['#D96A0F', '#3B82F6', '#16A34A', '#8B5CF6', '#D97706', '#DC2626'];

// Card de categoria reaproveitado na home e na busca ("ver todas") — mesma
// aparência nos dois lugares. Usa a foto que o admin subiu pra categoria
// (se tiver); sem foto, cai no emoji de sempre.
function categoryChipHTML(c, i) {
  const icon = c.image_url
    ? `<img src="${imgProxy(c.image_url)}" alt="" loading="lazy">`
    : categoryIcon[c.name] || '🛠️';
  return `
    <div class="chip ${c.hasProviders ? 'has-providers' : ''} ${c.image_url ? 'has-image' : ''}" onclick="openCategory('${c.name.replace(/'/g, "\\'")}')">
      ${c.hasProviders ? '<span class="chip-badge">Disponível</span>' : ''}
      <div class="chip-icon" style="background:${catBg[(i || 0) % catBg.length]};color:${catFg[(i || 0) % catFg.length]};">${icon}</div>
      <div class="chip-title">${c.name}</div>
    </div>
  `;
}

const CATEGORY_INFO = {
  'Reformas & Construção': { commonServices: ['Reforma de banheiro', 'Reforma de cozinha', 'Construção de muro', 'Reboco e alvenaria'], examplePlaceholder: 'Ex: reforma completa do banheiro, troca de piso e azulejo' },
  'Eletricista': { commonServices: ['Troca de tomada/interruptor', 'Instalação de chuveiro elétrico', 'Troca de disjuntor/quadro', 'Instalação de ventilador/luminária'], examplePlaceholder: 'Ex: trocar disjuntor e instalar 3 tomadas novas na sala' },
  'Hidráulica': { commonServices: ['Conserto de vazamento', 'Desentupimento', 'Instalação de torneira/registro', 'Troca de caixa d\'água'], examplePlaceholder: 'Ex: vazamento embaixo da pia da cozinha, água acumulando' },
  'Diarista/Limpeza': { commonServices: ['Limpeza residencial', 'Limpeza pós-obra', 'Limpeza de sofá/estofados', 'Faxina completa'], examplePlaceholder: 'Ex: apartamento de 2 quartos, limpeza pesada' },
  'Ar-Condicionado': { commonServices: ['Instalação de split', 'Manutenção/limpeza', 'Recarga de gás', 'Conserto de ar não gela'], examplePlaceholder: 'Ex: ar-condicionado split não está gelando, precisa de manutenção' },
  'Beleza & Bem-estar': { commonServices: ['Corte e escova', 'Manicure e pedicure', 'Design de sobrancelha', 'Massagem relaxante'], examplePlaceholder: 'Ex: corte e escova a domicílio, cabelo até os ombros' },
  'Aulas & Cursos': { commonServices: ['Aula de reforço escolar', 'Aula de inglês/idiomas', 'Aula de música/instrumento', 'Aula particular de matemática'], examplePlaceholder: 'Ex: aulas de reforço de matemática, ensino fundamental, 2x por semana' },
  'Tecnologia': { commonServices: ['Formatação de computador', 'Configuração de rede/wifi', 'Conserto de celular', 'Instalação de câmeras'], examplePlaceholder: 'Ex: computador lento, preciso formatar e reinstalar programas' },
  'Fretes & Transporte': { commonServices: ['Frete pequeno (carro)', 'Frete de móveis (caminhão)', 'Transporte de carga', 'Entrega expressa'], examplePlaceholder: 'Ex: transportar um sofá e uma geladeira, 5km de distância' },
  'Jardinagem': { commonServices: ['Corte de grama', 'Poda de árvores/arbustos', 'Manutenção de jardim', 'Paisagismo'], examplePlaceholder: 'Ex: jardim pequeno nos fundos, grama alta e árvores precisando de poda' },
  'Eventos': { commonServices: ['Organização de festa infantil', 'Decoração de casamento', 'Buffet para evento', 'DJ/som para festa'], examplePlaceholder: 'Ex: festa de aniversário infantil para 30 pessoas, decoração simples' },
  'Assistência Técnica': { commonServices: ['Conserto de eletrodomésticos', 'Manutenção de máquina de lavar', 'Conserto de geladeira', 'Reparo de fogão'], examplePlaceholder: 'Ex: máquina de lavar não centrifuga, precisa de conserto' },
  'Pintura': { commonServices: ['Pintura de parede interna', 'Pintura externa/fachada', 'Textura e grafiato', 'Pintura de portão/grade'], examplePlaceholder: 'Ex: pintar sala e dois quartos, tinta já escolhida' },
  'Marcenaria & Móveis': { commonServices: ['Móveis sob medida', 'Conserto de móveis', 'Restauração de madeira', 'Fabricação de armário'], examplePlaceholder: 'Ex: armário planejado para o quarto, 2 metros de largura' },
  'Serralheria': { commonServices: ['Portão de ferro', 'Grades de proteção', 'Solda em geral', 'Estrutura metálica'], examplePlaceholder: 'Ex: fazer um portão de ferro para garagem, 3 metros' },
  'Vidraçaria': { commonServices: ['Instalação de box de vidro', 'Espelhos sob medida', 'Troca de vidro quebrado', 'Janela/porta de vidro'], examplePlaceholder: 'Ex: instalar box de vidro no banheiro, medida padrão' },
  'Gesso & Drywall': { commonServices: ['Forro de gesso', 'Parede de drywall', 'Sanca e iluminação', 'Reparo de gesso'], examplePlaceholder: 'Ex: fazer forro de gesso na sala, com sanca para luz indireta' },
  'Pisos & Azulejos': { commonServices: ['Instalação de piso', 'Colocação de azulejo/revestimento', 'Reparo de piso solto', 'Rejunte'], examplePlaceholder: 'Ex: trocar piso da cozinha, 15m², porcelanato já comprado' },
  'Dedetização': { commonServices: ['Dedetização geral', 'Controle de cupim', 'Controle de pragas urbanas', 'Desratização'], examplePlaceholder: 'Ex: apartamento com formigas e baratas, dedetização completa' },
  'Piscinas': { commonServices: ['Limpeza de piscina', 'Manutenção mensal', 'Troca de bomba/filtro', 'Tratamento de água'], examplePlaceholder: 'Ex: piscina com água verde, precisa de limpeza e tratamento' },
  'Serviços Automotivos': { commonServices: ['Troca de óleo', 'Revisão geral', 'Mecânica básica', 'Elétrica automotiva'], examplePlaceholder: 'Ex: carro fazendo barulho ao frear, precisa de revisão' },
  'Guincho & Reboque': { commonServices: ['Guincho para carro quebrado', 'Reboque de moto', 'Transporte de veículo', 'Socorro na estrada'], examplePlaceholder: 'Ex: carro parou na estrada, preciso de guincho até a oficina' },
  'Chaveiro': { commonServices: ['Troca de fechadura', 'Cópia de chave', 'Abertura de porta trancada', 'Chave codificada'], examplePlaceholder: 'Ex: perdi a chave de casa, preciso trocar a fechadura' },
  'Costura & Reparos': { commonServices: ['Ajuste de roupa', 'Barra de calça', 'Conserto de zíper', 'Costura sob medida'], examplePlaceholder: 'Ex: ajustar a barra de 2 calças e trocar um zíper' },
  'Pet Care': { commonServices: ['Banho e tosa', 'Passeio com o pet', 'Adestramento', 'Hospedagem para pets'], examplePlaceholder: 'Ex: banho e tosa para um cachorro de porte médio' },
  'Babá & Cuidadores': { commonServices: ['Babá por período', 'Cuidadora infantil', 'Acompanhante escolar', 'Babá para eventos'], examplePlaceholder: 'Ex: preciso de babá das 8h às 18h, uma criança de 3 anos' },
  'Cuidados a Idosos': { commonServices: ['Cuidador de idosos', 'Acompanhante hospitalar', 'Cuidados noturnos', 'Auxílio em atividades diárias'], examplePlaceholder: 'Ex: cuidadora para acompanhar minha mãe durante o dia' },
  'Saúde & Terapias': { commonServices: ['Fisioterapia domiciliar', 'Massoterapia', 'Terapias alternativas', 'Enfermagem domiciliar'], examplePlaceholder: 'Ex: sessões de fisioterapia em casa, recuperação de cirurgia' },
  'Fotografia & Vídeo': { commonServices: ['Ensaio fotográfico', 'Cobertura de evento', 'Filmagem de casamento', 'Fotos de produtos'], examplePlaceholder: 'Ex: cobertura fotográfica de aniversário, 3 horas de evento' },
  'Música & DJ': { commonServices: ['DJ para festa', 'Banda ao vivo', 'Som e iluminação', 'Músico para casamento'], examplePlaceholder: 'Ex: DJ para festa de 50 pessoas, das 20h à meia-noite' },
  'Buffet & Gastronomia': { commonServices: ['Buffet para festa', 'Chef particular', 'Doces e bolos', 'Churrasco para evento'], examplePlaceholder: 'Ex: buffet para festa de 40 pessoas, salgados e bolo' },
  'Decoração': { commonServices: ['Decoração de festa', 'Decoração de ambientes', 'Consultoria de decoração', 'Arranjos e flores'], examplePlaceholder: 'Ex: decoração de aniversário infantil, tema festa junina' },
  'Design & Publicidade': { commonServices: ['Criação de logotipo', 'Design de redes sociais', 'Identidade visual', 'Material gráfico'], examplePlaceholder: 'Ex: criar logotipo e identidade visual para meu negócio' },
  'Marketing Digital': { commonServices: ['Gestão de redes sociais', 'Tráfego pago', 'Criação de site', 'Consultoria de marketing'], examplePlaceholder: 'Ex: gerenciar Instagram da minha loja, 3 posts por semana' },
  'Contabilidade': { commonServices: ['Abertura de empresa (MEI)', 'Declaração de imposto de renda', 'Contabilidade mensal', 'Folha de pagamento'], examplePlaceholder: 'Ex: abrir MEI e organizar contabilidade mensal do negócio' },
  'Jurídico': { commonServices: ['Consulta trabalhista', 'Contrato de aluguel', 'Ação de consumidor', 'Assessoria jurídica geral'], examplePlaceholder: 'Ex: preciso de ajuda com um contrato de aluguel' },
  'Consultoria': { commonServices: ['Consultoria de negócios', 'Planejamento financeiro', 'Consultoria de RH', 'Mentoria profissional'], examplePlaceholder: 'Ex: consultoria pra organizar as finanças do meu pequeno negócio' },
  'Traduções': { commonServices: ['Tradução de documentos', 'Tradução juramentada', 'Legendagem', 'Tradução simultânea'], examplePlaceholder: 'Ex: traduzir certidão de nascimento para o inglês' },
  'Alfaiataria': { commonServices: ['Terno sob medida', 'Ajuste de roupa social', 'Camisa sob medida', 'Reparo de terno'], examplePlaceholder: 'Ex: fazer um terno sob medida para casamento' },
  'Mudanças': { commonServices: ['Mudança residencial', 'Mudança comercial', 'Frete de móveis', 'Desmontagem e montagem'], examplePlaceholder: 'Ex: mudança de apartamento de 2 quartos, mesma cidade' },
  'Segurança & CFTV': { commonServices: ['Instalação de câmeras', 'Cerca elétrica', 'Alarme residencial', 'Interfone/portão eletrônico'], examplePlaceholder: 'Ex: instalar 4 câmeras de segurança na casa' },
  'Energia Solar': { commonServices: ['Instalação de painel solar', 'Manutenção de sistema solar', 'Projeto de energia solar', 'Análise de consumo'], examplePlaceholder: 'Ex: instalar energia solar para reduzir a conta de luz' },
  'Personal Trainer': { commonServices: ['Treino personalizado', 'Acompanhamento fitness', 'Treino em domicílio', 'Avaliação física'], examplePlaceholder: 'Ex: treino personalizado 3x por semana, na minha casa' },
  'Montagem de Móveis': { commonServices: ['Montagem de guarda-roupa', 'Montagem de cama/cômoda', 'Montagem de móveis de loja', 'Instalação de prateleiras'], examplePlaceholder: 'Ex: montar guarda-roupa de 6 portas comprado pela internet' },
  'Manicure a domicílio': { commonServices: ['Manicure e pedicure', 'Unha em gel', 'Alongamento de unhas', 'Esmaltação em domicílio'], examplePlaceholder: 'Ex: manicure e pedicure a domicílio, sábado à tarde' },
  'Fretes e Mudanças': { commonServices: ['Frete pequeno (carro)', 'Mudança residencial', 'Frete de móveis (caminhão)', 'Transporte de carga'], examplePlaceholder: 'Ex: mudança de apartamento de 2 quartos, mesma cidade' },
  'Cuidados com Pets': { commonServices: ['Banho e tosa', 'Passeio com o pet', 'Hospedagem para pets', 'Adestramento'], examplePlaceholder: 'Ex: banho e tosa para um cachorro de porte médio' },
  'Pedreiro': { commonServices: ['Construção de muro', 'Reboco e alvenaria', 'Assentamento de tijolos', 'Fundação e alicerce'], examplePlaceholder: 'Ex: construir um muro de 10 metros no fundo do terreno' },
  'Guincho': { commonServices: ['Guincho para carro quebrado', 'Reboque de moto', 'Socorro na estrada', 'Transporte de veículo'], examplePlaceholder: 'Ex: carro parou na estrada, preciso de guincho até a oficina' },
  'Viagens': { commonServices: ['Motorista particular', 'Transfer para aeroporto', 'Viagem intermunicipal', 'Passeio com motorista'], examplePlaceholder: 'Ex: preciso de transporte até o aeroporto de Cascavel' },
  'Criar site e Apps': { commonServices: ['Site institucional', 'Loja virtual (e-commerce)', 'Aplicativo mobile', 'Landing page'], examplePlaceholder: 'Ex: preciso de um site institucional para minha empresa' },
  'Técnico de Informática': { commonServices: ['Formatação de computador', 'Manutenção de PC/notebook', 'Instalação de programas', 'Remoção de vírus'], examplePlaceholder: 'Ex: computador lento e travando, preciso de manutenção' },
  'Motorista de App': { commonServices: ['Corrida particular', 'Transporte por aplicativo', 'Transfer', 'Corrida agendada'], examplePlaceholder: 'Ex: preciso de uma corrida até o centro da cidade' },
  'Freelancer': { commonServices: ['Redação e conteúdo', 'Edição de vídeo', 'Design gráfico', 'Trabalho remoto pontual'], examplePlaceholder: 'Ex: preciso de alguém pra escrever textos pro meu site' },
  'Motoboy': { commonServices: ['Entrega expressa', 'Entrega de documentos', 'Entrega de encomendas', 'Coleta e entrega'], examplePlaceholder: 'Ex: preciso entregar um pacote pequeno hoje à tarde' },
  'Marido de Aluguel': { commonServices: ['Pendurar quadro/prateleira', 'Pequenos reparos gerais', 'Trocar trinco/dobradiça', 'Ajustes e consertos do dia a dia'], examplePlaceholder: 'Ex: pendurar 2 prateleiras e trocar uma dobradiça de porta' },
};

let categoriesCache = [];
let requestDraft = { category: '', serviceName: '', preferredProviderId: null };
let rateServiceRequestId = null;
let selectedServiceRating = 0;
let selectedRegCategories = new Set();

async function api(path, options = {}) {
  const headers = { Authorization: `Bearer ${token}`, ...(options.headers || {}) };
  let body = options.body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, body });
  if (res.status === 401) {
    doLogout();
    throw new Error('Sessão expirada');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erro ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const target = document.querySelector(`.screen[data-screen="${id}"]`);
  if (target) {
    target.classList.add('active');
    target.querySelector('.screen-scroll')?.scrollTo(0, 0);
  }
}

// Usado pelo botão "Entrar" da navegação livre e pelo link ?login=1 (landing
// page usa esse link pra "já tenho conta", já que o link puro /app/ agora
// cai na navegação livre, não mais direto no formulário de login).
function goToLogin() {
  showScreen('login');
}

function openComingSoon(feature) {
  alert(`${feature} — em breve no NEXSERV.`);
}

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>',
  requests: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 9h6M9 13h6"/></svg>',
  messages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.5 8.5 0 1 1-3.8-7.1L21 3l-1 4.2a8.46 8.46 0 0 1 1 4.3z"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>',
  earnings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h4.5a1.5 1.5 0 010 3H9"/></svg>',
};

function clientNavConfig() {
  return [
    { id: 'home', label: 'Início', icon: ICONS.home },
    { id: 'search', label: 'Buscar', icon: ICONS.search, action: "openSearchScreen()" },
    { id: 'my-requests', label: 'Pedidos', icon: ICONS.requests, action: "setTab('my-requests')", raised: true },
    { id: 'messages', label: 'Mensagens', icon: ICONS.messages },
    { id: 'profile', label: 'Perfil', icon: ICONS.profile },
  ];
}
function providerNavConfig() {
  return [
    { id: 'provider-home', label: 'Início', icon: ICONS.home },
    { id: 'provider-jobs', label: 'Trabalhos', icon: ICONS.requests },
    { id: 'provider-earnings', label: 'Ganhos', icon: ICONS.earnings },
    { id: 'messages', label: 'Mensagens', icon: ICONS.messages },
    { id: 'profile', label: 'Perfil', icon: ICONS.profile },
  ];
}

const NAV_CONTAINER_IDS = ['client-nav', 'provider-nav', 'my-requests-nav', 'provider-jobs-nav', 'provider-earnings-nav', 'messages-nav', 'profile-nav'];

function renderAllNavs(activeId) {
  const items = user.role === 'provider' ? providerNavConfig() : clientNavConfig();
  const html = items.map((it) => it.raised ? `
    <button class="slot raised" onclick="${it.action || `setTab('${it.id}')`}">
      <div class="fab">${it.icon}</div><span>${it.label}</span>
    </button>
  ` : `
    <button class="slot ${it.id === activeId ? 'active' : ''}" onclick="${it.action || `setTab('${it.id}')`}">
      ${it.icon}<span>${it.label}</span>
    </button>
  `).join('');
  NAV_CONTAINER_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

function homeScreenId() { return user && user.role === 'provider' ? 'provider-home' : 'home'; }

function setTab(id) {
  trackScreen(id);
  if (!token && GUEST_GATED_TABS.has(id)) { openRegister('client'); return; }
  if (id === 'provider-home' && providerAwaitingExpansion) {
    showScreen('provider-waiting-expansion');
    renderAllNavs('provider-home');
    return;
  }
  showScreen(id);
  renderAllNavs(id);
  if (id === 'home') { loadHomeCategories(); loadFeaturedProviders(); if (token) refreshNotifBadge(); }
  if (id === 'my-requests') loadMyRequests();
  if (id === 'provider-home') { loadOpenRequests(); refreshNotifBadge(); }
  if (id === 'provider-jobs') loadProviderJobs();
  if (id === 'provider-earnings') loadEarningsScreen();
  if (id === 'messages') loadConversations();
  if (id === 'profile') loadProfile();
}

// ---------- Auth ----------
function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.classList.toggle('visible', !showing);
}

// Pra onde o botão "voltar" da tela de cadastro deve ir. Quando o cadastro
// é aberto a partir da própria tela de login, volta pra login (como sempre
// foi). Quando é aberto navegando livre (clique em categoria, aba travada,
// botão "Cadastrar" da home), tem que voltar pra home — não pra login, que
// nem faz sentido pra quem nunca tentou entrar com senha.
let registerBackScreen = 'login';

function openRegister(role, backTo) {
  registerBackScreen = backTo || homeScreenId();
  showScreen('register');
  setRole(role);
  if (role === 'provider') renderRegCategoryChips();
}

const CLIENT_REGISTRATION_ENABLED = true;

function setRole(role) {
  selectedRole = role;
  document.getElementById('role-client-btn').classList.toggle('active', role === 'client');
  document.getElementById('role-provider-btn').classList.toggle('active', role === 'provider');
  document.getElementById('provider-fields').style.display = role === 'provider' ? 'block' : 'none';
  document.getElementById('client-fields').style.display = role === 'client' ? 'block' : 'none';

  const blocked = role === 'client' && !CLIENT_REGISTRATION_ENABLED;
  document.getElementById('client-coming-soon').style.display = blocked ? 'block' : 'none';
  document.getElementById('register-form-fields').style.display = blocked ? 'none' : 'block';
  if (blocked) {
    document.getElementById('waitlist-form').style.display = 'block';
    document.getElementById('waitlist-success').style.display = 'none';
  }

  document.getElementById('how-it-works-btn').style.display = role === 'provider' ? 'block' : 'none';
  if (role === 'provider') { renderRegCategoryChips(); loadRegCityChips(); }
}

let providerPromoCache = null;
let howItWorksOrigin = 'register';

async function openHowItWorks(origin) {
  howItWorksOrigin = origin;
  showScreen('how-it-works');
  const el = document.getElementById('how-it-works-content');
  el.innerHTML = '<p style="font-size:13px;color:var(--ink-soft);">Carregando...</p>';
  try {
    if (!providerPromoCache) {
      const res = await fetch(`${API_BASE}/provider-promo`);
      providerPromoCache = await res.json();
    }
    const { standardRate, promoCap, promoDurationMonths, slotsRemaining } = providerPromoCache;
    const promoActive = slotsRemaining > 0;
    el.innerHTML = `
      <strong style="font-size:14px;">💰 Como funciona por aqui</strong>
      <ul style="margin:10px 0 0;padding-left:18px;font-size:13px;color:var(--ink-soft);line-height:1.8;">
        <li>Comissão da plataforma: <strong style="color:var(--ink);">${standardRate}%</strong> sobre cada serviço pago pelo cliente.</li>
        ${promoActive ? `<li>🏆 Benefício de fundador: como você é um dos <strong style="color:var(--primary-dark);">${promoCap} primeiros prestadores</strong>, ganha <strong style="color:var(--ink);">selo permanente</strong> no seu perfil, <strong style="color:var(--ink);">200 moedas</strong> de bônus e <strong style="color:var(--ink);">destaque de perfil grátis por ${promoDurationMonths} meses</strong> (aparece em rodízio na home, dando vez pra todos os fundadores).</li>` : ''}
        <li>100 moedas pra destacar uma proposta específica — sobe ela no topo pro cliente daquele pedido.</li>
        <li>300 moedas pra desbloquear o contato de cada cliente (só depois que ele pagar).</li>
        <li>700 moedas pra destacar seu perfil por 30 dias — aparece primeiro pros clientes e ganha o selo "Destaque" nas propostas.</li>
        <li>Saque dos seus ganhos direto pra sua conta bancária, aprovação em até 1 dia útil.</li>
      </ul>`;
  } catch {
    el.innerHTML = '<p style="font-size:13px;color:var(--ink-soft);">Não foi possível carregar essas informações agora.</p>';
  }
}

function closeHowItWorks() {
  showScreen(howItWorksOrigin === 'profile' ? 'profile' : 'register');
}

// ---------- Termos / Política de privacidade (LGPD) ----------
let legalScreenOrigin = 'profile';

function openLegalScreen(screenId, origin) {
  legalScreenOrigin = origin || legalScreenOrigin;
  showScreen(screenId);
}

function closeLegalScreen() {
  showScreen(legalScreenOrigin === 'register' ? 'register' : 'profile');
}

function showDeleteAccountConfirm() {
  document.getElementById('delete-account-link').style.display = 'none';
  document.getElementById('delete-account-confirm').style.display = 'block';
}

function hideDeleteAccountConfirm() {
  document.getElementById('delete-account-confirm').style.display = 'none';
  document.getElementById('delete-account-link').style.display = 'inline';
}

async function confirmDeleteAccount() {
  const btn = document.getElementById('delete-account-confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Excluindo...';
  try {
    await api('/auth/me', { method: 'DELETE' });
    alert('Sua conta foi excluída. Sentiremos sua falta!');
    doLogout();
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
    btn.textContent = 'Sim, excluir conta';
  }
}

async function joinWaitlist() {
  const errorEl = document.getElementById('waitlist-error');
  errorEl.textContent = '';
  const name = document.getElementById('waitlist-name').value.trim();
  const email = document.getElementById('waitlist-email').value.trim();
  const phone = document.getElementById('waitlist-phone').value.trim();
  if (!name || !email) { errorEl.textContent = 'Preencha nome e e-mail.'; return; }

  try {
    const res = await fetch(`${API_BASE}/auth/waitlist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao entrar na lista');
    document.getElementById('waitlist-form').style.display = 'none';
    document.getElementById('waitlist-success').style.display = 'block';
    trackConversionEvent('Lead', { content_name: 'waitlist' });
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

async function renderRegCategoryChips() {
  const categories = await ensureCategories();
  const query = normalize(document.getElementById('reg-category-search')?.value || '');
  const filtered = query ? categories.filter((c) => normalize(c.name).includes(query)) : categories;
  document.getElementById('reg-category-chips').innerHTML = filtered.map((c) => `
    <div class="chip-opt ${selectedRegCategories.has(c.name) ? 'selected' : ''}" onclick="toggleRegCategory('${c.name.replace(/'/g, "\\'")}')">${c.name}</div>
  `).join('') || '<p style="font-size:12.5px;color:var(--ink-faint);">Nenhuma categoria encontrada.</p>';
}

function toggleRegCategory(name) {
  if (selectedRegCategories.has(name)) selectedRegCategories.delete(name);
  else selectedRegCategories.add(name);
  renderRegCategoryChips();
}

// Cidades extras (além da própria) que o prestador já escolhe atender na
// hora do cadastro — opcional, ele pode ajustar depois em "Cidades que atendo".
let selectedRegServiceCities = new Set();

async function loadRegCityChips() {
  if (!availableCitiesCache.length) availableCitiesCache = await api('/cities/active');
  renderRegCityChips();
}

function renderRegCityChips() {
  document.getElementById('reg-city-chips').innerHTML = availableCitiesCache.map((c) => {
    const key = `${c.city}|${c.state}`;
    return `<div class="chip-opt ${selectedRegServiceCities.has(key) ? 'selected' : ''}" onclick="toggleRegServiceCity('${c.city.replace(/'/g, "\\'")}','${c.state}')">${c.city}/${c.state}</div>`;
  }).join('') || '<p style="font-size:12.5px;color:var(--ink-faint);">Nenhuma cidade disponível ainda.</p>';
}

function toggleRegServiceCity(city, state) {
  const key = `${city}|${state}`;
  if (selectedRegServiceCities.has(key)) selectedRegServiceCities.delete(key);
  else selectedRegServiceCities.add(key);
  renderRegCityChips();
}

// ---------- Categorias do prestador (editável depois do cadastro) ----------
let selectedProviderCategories = new Set();
let selectedProviderServiceCities = new Set();

async function loadProviderCategoriesScreen() {
  document.getElementById('provider-profile-city').value = user.city || '';
  document.getElementById('provider-profile-state').value = user.state || '';
  document.getElementById('provider-city-error').textContent = '';
  document.getElementById('provider-service-cities-error').textContent = '';
  const [categories, mine, activeCities, myServiceCities] = await Promise.all([
    ensureCategories(),
    api('/provider/categories/mine'),
    availableCitiesCache.length ? Promise.resolve(availableCitiesCache) : api('/cities/active'),
    api('/provider/service-cities/mine'),
  ]);
  availableCitiesCache = activeCities;
  selectedProviderCategories = new Set(mine.categories);
  selectedProviderServiceCities = new Set(myServiceCities.map((c) => `${c.city}|${c.state}`));
  renderProviderCategoryChips(categories);
  renderProviderServiceCityChips();
  loadProviderCatalogSections();
  loadProviderTravelFee();
  loadProviderKmRateSections();
}

// ---------- Preço por km do prestador (mobilidade) ----------
async function loadProviderKmRateSections() {
  const wrap = document.getElementById('provider-km-rate-wrap');
  const myCategories = KM_RATE_CATEGORIES.filter((c) => selectedProviderCategories.has(c));
  if (myCategories.length === 0) { wrap.innerHTML = ''; return; }

  const rates = await Promise.all(myCategories.map((cat) => api(`/provider/km-rate/mine?category=${encodeURIComponent(cat)}`)));

  wrap.innerHTML = `
    <div class="section-title" style="margin-top:24px;"><h3>Preço por km (mobilidade)</h3></div>
    <p style="font-size:12.5px;color:var(--ink-soft);margin-top:0;">O cliente escolhe cidade de origem e destino, o valor sai calculado automático (taxa fixa + km rodado).</p>
    ${myCategories.map((cat, i) => {
      const rate = rates[i];
      return `
      <div style="border:1.5px solid var(--line);border-radius:11px;padding:12px;margin-bottom:10px;">
        <strong style="font-size:13.5px;">${cat}</strong>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <div class="field" style="flex:1;margin-bottom:0;"><label>R$ por km</label><input id="km-rate-perkm-${cssId(cat)}" oninput="formatMoneyInput(this)" value="${rate ? Number(rate.price_per_km).toFixed(2).replace('.', ',') : ''}" placeholder="0,00"></div>
          <div class="field" style="flex:1;margin-bottom:0;"><label>Taxa fixa (opcional)</label><input id="km-rate-base-${cssId(cat)}" oninput="formatMoneyInput(this)" value="${rate && rate.base_fee > 0 ? Number(rate.base_fee).toFixed(2).replace('.', ',') : ''}" placeholder="0,00"></div>
        </div>
        <button class="btn btn-ghost btn-block btn-small" style="margin-top:8px;" onclick="saveProviderKmRate('${cat.replace(/'/g, "\\'")}')">Salvar</button>
        <div class="error-msg" id="km-rate-error-${cssId(cat)}"></div>
      </div>
    `;
    }).join('')}
  `;
}

async function saveProviderKmRate(category) {
  const errorEl = document.getElementById(`km-rate-error-${cssId(category)}`);
  errorEl.textContent = '';
  const pricePerKm = parseMoneyInput(document.getElementById(`km-rate-perkm-${cssId(category)}`).value);
  const baseFeeRaw = document.getElementById(`km-rate-base-${cssId(category)}`).value;
  const baseFee = baseFeeRaw ? parseMoneyInput(baseFeeRaw) : 0;
  if (!pricePerKm || isNaN(pricePerKm) || pricePerKm <= 0) {
    errorEl.style.color = 'var(--danger)';
    errorEl.textContent = 'Preencha o valor por km.';
    return;
  }
  try {
    await api('/provider/km-rate', { method: 'PUT', body: { category, pricePerKm, baseFee } });
    errorEl.style.color = 'var(--success)';
    errorEl.textContent = 'Salvo.';
  } catch (err) {
    errorEl.style.color = 'var(--danger)';
    errorEl.textContent = err.message;
  }
}

async function loadProviderTravelFee() {
  const { fee } = await api('/provider/catalog-travel-fee');
  const input = document.getElementById('provider-travel-fee-input');
  input.value = fee != null ? Number(fee).toFixed(2).replace('.', ',') : '';
}

async function saveProviderTravelFee() {
  const errorEl = document.getElementById('provider-travel-fee-error');
  errorEl.textContent = '';
  const raw = document.getElementById('provider-travel-fee-input').value;
  const fee = raw ? parseMoneyInput(raw) : null;
  try {
    await api('/provider/catalog-travel-fee', { method: 'PUT', body: { fee } });
    errorEl.style.color = 'var(--success)';
    errorEl.textContent = 'Taxa salva.';
  } catch (err) {
    errorEl.style.color = 'var(--danger)';
    errorEl.textContent = err.message;
  }
}

function renderProviderServiceCityChips() {
  document.getElementById('provider-service-city-chips').innerHTML = availableCitiesCache.map((c) => {
    const key = `${c.city}|${c.state}`;
    return `<div class="chip-opt ${selectedProviderServiceCities.has(key) ? 'selected' : ''}" onclick="toggleProviderServiceCity('${c.city.replace(/'/g, "\\'")}','${c.state}')">${c.city}/${c.state}</div>`;
  }).join('') || '<p style="font-size:12.5px;color:var(--ink-faint);">Nenhuma cidade disponível ainda.</p>';
}

function toggleProviderServiceCity(city, state) {
  const key = `${city}|${state}`;
  if (selectedProviderServiceCities.has(key)) selectedProviderServiceCities.delete(key);
  else selectedProviderServiceCities.add(key);
  renderProviderServiceCityChips();
}

async function saveProviderServiceCities() {
  const errorEl = document.getElementById('provider-service-cities-error');
  errorEl.textContent = '';
  const cities = Array.from(selectedProviderServiceCities).map((key) => {
    const [city, state] = key.split('|');
    return { city, state };
  });
  try {
    await api('/provider/service-cities', { method: 'PUT', body: { cities } });
    errorEl.style.color = 'var(--success)';
    errorEl.textContent = 'Cidades salvas.';
  } catch (err) {
    errorEl.style.color = 'var(--danger)';
    errorEl.textContent = err.message;
  }
}

async function saveProviderCity() {
  const errorEl = document.getElementById('provider-city-error');
  errorEl.textContent = '';
  const city = document.getElementById('provider-profile-city').value.trim();
  const state = document.getElementById('provider-profile-state').value.trim().toUpperCase();
  if (!city) { errorEl.textContent = 'Digite sua cidade.'; return; }
  try {
    const updated = await api('/auth/me', { method: 'PATCH', body: { city, state } });
    Object.assign(user, { city: updated.city, state: updated.state });
    localStorage.setItem('chama_user', JSON.stringify(user));
    errorEl.style.color = 'var(--success)';
    errorEl.textContent = 'Cidade salva.';
  } catch (err) {
    errorEl.style.color = 'var(--danger)';
    errorEl.textContent = err.message;
  }
}

function renderProviderCategoryChips(categories) {
  const query = normalize(document.getElementById('provider-category-search')?.value || '');
  const filtered = query ? categories.filter((c) => normalize(c.name).includes(query)) : categories;
  document.getElementById('provider-category-chips').innerHTML = filtered.map((c) => `
    <div class="chip-opt ${selectedProviderCategories.has(c.name) ? 'selected' : ''}" onclick="toggleProviderCategory('${c.name.replace(/'/g, "\\'")}')">${c.name}</div>
  `).join('') || '<p style="font-size:12.5px;color:var(--ink-faint);">Nenhuma categoria encontrada.</p>';
}

async function toggleProviderCategory(name) {
  if (selectedProviderCategories.has(name)) selectedProviderCategories.delete(name);
  else selectedProviderCategories.add(name);
  renderProviderCategoryChips(await ensureCategories());
}

async function saveProviderCategories() {
  const errorEl = document.getElementById('provider-categories-error');
  errorEl.textContent = '';
  try {
    await api('/provider/categories', { method: 'PUT', body: { categories: Array.from(selectedProviderCategories) } });
    setTab('profile');
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

// ---------- Catálogo de preço fixo do prestador ----------
// Só liberado nessas categorias por enquanto (lançamento em etapas, como o
// próprio sistema de categorias com cobertura fez antes).
const FIXED_PRICE_CATEGORIES = [
  'Eletricista', 'Diarista/Limpeza', 'Hidráulica', 'Montagem de Móveis', 'Marido de Aluguel', 'Babá & Cuidadores', 'Cuidados a Idosos',
  'Ar-Condicionado', 'Pintura', 'Chaveiro', 'Jardinagem', 'Dedetização', 'Vidraçaria', 'Gesso & Drywall', 'Pisos & Azulejos',
  'Segurança & CFTV', 'Técnico de Informática', 'Manicure a domicílio', 'Personal Trainer', 'Costura & Reparos',
  'Cuidados com Pets', 'Pet Care', 'Piscinas', 'Fotografia & Vídeo', 'Música & DJ',
];
// Categorias de mobilidade — preço calculado por km (origem/destino), não por
// item. Fluxo separado do catálogo de itens, ver loadProviderKmRateSections.
const KM_RATE_CATEGORIES = ['Motoboy', 'Motorista de App', 'Fretes & Transporte', 'Fretes e Mudanças', 'Guincho & Reboque', 'Mudanças', 'Guincho', 'Viagens'];
let providerCatalogState = {};

async function loadProviderCatalogSections() {
  const wrap = document.getElementById('provider-catalog-wrap');
  const myCategories = FIXED_PRICE_CATEGORIES.filter((c) => selectedProviderCategories.has(c));
  if (myCategories.length === 0) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = myCategories.map((cat) => `
    <div class="section-title" style="margin-top:24px;"><h3>Catálogo de preço fixo — ${cat}</h3></div>
    <p style="font-size:12.5px;color:var(--ink-soft);margin-top:0;">Preencha o preço dos itens que quer oferecer com contratação direta. Deixe em branco o que não quiser oferecer.</p>
    <div id="provider-catalog-list-${cssId(cat)}"></div>
    <div class="chip-opt" style="display:inline-flex;align-items:center;gap:4px;margin-top:8px;" onclick="addProviderCatalogCustomRow('${cat.replace(/'/g, "\\'")}')">+ Adicionar serviço próprio</div>
    <button class="btn btn-ghost btn-block btn-small" style="margin-top:10px;" onclick="saveProviderCatalog('${cat.replace(/'/g, "\\'")}')">Salvar catálogo — ${cat}</button>
    <div class="error-msg" id="provider-catalog-error-${cssId(cat)}"></div>
  `).join('');

  await Promise.all(myCategories.map((cat) => loadProviderCatalogCategory(cat)));
}

function cssId(str) { return str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, ''); }

async function loadProviderCatalogCategory(category) {
  const [templates, mine] = await Promise.all([
    api(`/provider/catalog/templates?category=${encodeURIComponent(category)}`),
    api(`/provider/catalog/mine?category=${encodeURIComponent(category)}`),
  ]);
  const rows = templates.map((t) => {
    const mineItem = mine.find((m) => normalize(m.name) === normalize(t.name));
    return { id: mineItem?.id || null, name: t.name, unit: t.unit, price: mineItem?.price ?? null, isCustom: false };
  });
  mine.filter((m) => !templates.some((t) => normalize(t.name) === normalize(m.name)))
    .forEach((m) => rows.push({ id: m.id, name: m.name, unit: m.unit, price: m.price, isCustom: true }));
  providerCatalogState[category] = rows;
  renderProviderCatalogRows(category);
}

function renderProviderCatalogRows(category) {
  const list = document.getElementById(`provider-catalog-list-${cssId(category)}`);
  if (!list) return;
  list.innerHTML = providerCatalogState[category].map((row, i) => `
    <div style="display:flex;align-items:center;gap:8px;border:1.5px solid var(--line);border-radius:11px;padding:8px 10px;margin-bottom:8px;">
      <span style="flex:1;font-size:13px;">${row.name}${row.isCustom ? ` <span style="color:var(--ink-faint);font-size:11px;">(próprio)</span>` : ''}</span>
      <span style="font-size:12px;color:var(--ink-soft);">${row.unit}</span>
      <span style="font-size:12.5px;color:var(--ink-soft);">R$</span>
      <input data-cat="${category.replace(/"/g, '&quot;')}" data-idx="${i}" value="${row.price != null ? Number(row.price).toFixed(2).replace('.', ',') : ''}"
        oninput="formatMoneyInput(this)" style="width:80px;text-align:right;font-size:16px;">
      ${row.isCustom ? `<span style="cursor:pointer;color:var(--danger);font-size:15px;" onclick="removeProviderCatalogRow('${category.replace(/'/g, "\\'")}', ${i})">✕</span>` : ''}
    </div>
  `).join('') || '<p style="font-size:12.5px;color:var(--ink-faint);">Nenhum item ainda.</p>';
}

function addProviderCatalogCustomRow(category) {
  const name = prompt('Nome do serviço:');
  if (!name || !name.trim()) return;
  const unit = prompt('Unidade (ex: unidade, hora, diária):', 'unidade') || 'unidade';
  providerCatalogState[category].push({ id: null, name: name.trim(), unit: unit.trim(), price: null, isCustom: true });
  renderProviderCatalogRows(category);
}

async function removeProviderCatalogRow(category, idx) {
  const row = providerCatalogState[category][idx];
  if (row.id) {
    try { await api(`/provider/catalog/${row.id}`, { method: 'DELETE' }); } catch (err) { alert(err.message); return; }
  }
  providerCatalogState[category].splice(idx, 1);
  renderProviderCatalogRows(category);
}

async function saveProviderCatalog(category) {
  const errorEl = document.getElementById(`provider-catalog-error-${cssId(category)}`);
  errorEl.textContent = '';
  const inputs = document.querySelectorAll(`#provider-catalog-list-${cssId(category)} input[data-cat]`);
  try {
    for (const input of inputs) {
      const idx = parseInt(input.dataset.idx, 10);
      const row = providerCatalogState[category][idx];
      const price = parseMoneyInput(input.value);
      if (!input.value || isNaN(price) || price <= 0) {
        if (row.id) { await api(`/provider/catalog/${row.id}`, { method: 'DELETE' }); row.id = null; }
        continue;
      }
      if (row.id) {
        await api(`/provider/catalog/${row.id}`, { method: 'PATCH', body: { price } });
      } else {
        const created = await api('/provider/catalog', { method: 'POST', body: { category, name: row.name, unit: row.unit, price } });
        row.id = created.id;
      }
      row.price = price;
    }
    errorEl.style.color = 'var(--success)';
    errorEl.textContent = 'Catálogo salvo.';
  } catch (err) {
    errorEl.style.color = 'var(--danger)';
    errorEl.textContent = err.message;
  }
}

async function callSupport() {
  try {
    const { number } = await api('/support-whatsapp');
    if (!number) { alert('Suporte via WhatsApp ainda não foi configurado.'); return; }
    window.open(`https://wa.me/${number.replace(/\D/g, '')}`, '_blank');
  } catch {
    alert('Não foi possível abrir o WhatsApp do suporte agora.');
  }
}

function openForgotPassword() {
  document.getElementById('forgot-email').value = '';
  document.getElementById('forgot-password-error').textContent = '';
  document.getElementById('forgot-password-form').style.display = 'block';
  document.getElementById('forgot-password-success').style.display = 'none';
  showScreen('forgot-password');
}

async function sendForgotPasswordEmail() {
  const email = document.getElementById('forgot-email').value.trim();
  const errorEl = document.getElementById('forgot-password-error');
  errorEl.textContent = '';
  if (!email) { errorEl.textContent = 'Digite seu e-mail.'; return; }
  try {
    await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    document.getElementById('forgot-password-form').style.display = 'none';
    document.getElementById('forgot-password-success').style.display = 'block';
  } catch (err) {
    errorEl.textContent = 'Erro ao enviar o link. Tente novamente.';
  }
}

let resetPasswordToken = null;

function openResetPassword(resetToken) {
  resetPasswordToken = resetToken;
  document.getElementById('reset-new-password').value = '';
  document.getElementById('reset-confirm-password').value = '';
  document.getElementById('reset-password-error').textContent = '';
  document.getElementById('reset-password-form').style.display = 'block';
  document.getElementById('reset-password-success').style.display = 'none';
  showScreen('reset-password');
}

async function submitResetPassword() {
  const newPassword = document.getElementById('reset-new-password').value;
  const confirmPassword = document.getElementById('reset-confirm-password').value;
  const errorEl = document.getElementById('reset-password-error');
  errorEl.textContent = '';
  if (newPassword.length < 6) { errorEl.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; return; }
  if (newPassword !== confirmPassword) { errorEl.textContent = 'As senhas não coincidem.'; return; }
  try {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetPasswordToken, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { errorEl.textContent = data.error || 'Erro ao redefinir a senha.'; return; }
    document.getElementById('reset-password-form').style.display = 'none';
    document.getElementById('reset-password-success').style.display = 'block';
  } catch (err) {
    errorEl.textContent = 'Erro ao redefinir a senha. Tente novamente.';
  }
}

async function doLogin(btn) {
  if (btn.disabled) return;
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao entrar');
    saveSession(data.token, data.user);
    enterApp();
  } catch (err) {
    errorEl.textContent = err.message;
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function doRegister(btn) {
  if (btn.disabled) return;
  const errorEl = document.getElementById('register-error');
  errorEl.textContent = '';

  if (!document.getElementById('reg-terms-accepted').checked) {
    errorEl.textContent = 'Você precisa aceitar os Termos de Uso e a Política de Privacidade pra continuar.';
    return;
  }
  if (selectedRole === 'provider' && selectedRegCategories.size === 0) {
    errorEl.textContent = 'Selecione ao menos uma categoria que você atende.';
    return;
  }

  const fd = new FormData();
  fd.append('role', selectedRole);
  fd.append('termsAccepted', 'true');
  fd.append('name', document.getElementById('reg-name').value);
  fd.append('email', document.getElementById('reg-email').value);
  fd.append('password', document.getElementById('reg-password').value);
  fd.append('phone', document.getElementById('reg-phone').value);
  const referral = document.getElementById('reg-referral').value.trim();
  if (referral) fd.append('referralCode', referral);

  try {
    const attribution = JSON.parse(localStorage.getItem('chama_signup_attribution') || 'null');
    if (attribution) {
      if (attribution.source) fd.append('signupUtmSource', attribution.source);
      if (attribution.medium) fd.append('signupUtmMedium', attribution.medium);
      if (attribution.campaign) fd.append('signupUtmCampaign', attribution.campaign);
      if (attribution.content) fd.append('signupUtmContent', attribution.content);
      if (attribution.referrer) fd.append('signupReferrer', attribution.referrer);
    }
  } catch { /* sem atribuição capturada, segue normal */ }

  if (selectedRole === 'provider') {
    fd.append('document', document.getElementById('reg-document').value);
    fd.append('zipCode', document.getElementById('reg-zip').value);
    fd.append('street', document.getElementById('reg-street').value);
    fd.append('streetNumber', document.getElementById('reg-street-number').value);
    fd.append('complement', document.getElementById('reg-complement').value);
    fd.append('neighborhood', document.getElementById('reg-neighborhood').value);
    fd.append('city', document.getElementById('reg-city').value);
    fd.append('state', document.getElementById('reg-state').value);
    fd.append('categories', Array.from(selectedRegCategories).join(','));
  } else {
    fd.append('document', document.getElementById('reg-client-document').value);
    fd.append('zipCode', document.getElementById('reg-client-zip').value);
    fd.append('neighborhood', document.getElementById('reg-client-neighborhood').value);
    fd.append('city', document.getElementById('reg-client-city').value);
    fd.append('state', document.getElementById('reg-client-state').value);
  }

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Criando conta...';
  try {
    const res = await fetch(`${API_BASE}/auth/register`, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar');
    saveSession(data.token, data.user);
    trackConversionEvent('CompleteRegistration', { content_name: selectedRole });
    if (selectedRole === 'provider' && selectedRegServiceCities.size > 0) {
      const homeCity = document.getElementById('reg-city').value.trim();
      const homeState = document.getElementById('reg-state').value.trim().toUpperCase();
      const cities = Array.from(selectedRegServiceCities).map((key) => {
        const [c, s] = key.split('|');
        return { city: c, state: s };
      });
      if (homeCity && homeState && !selectedRegServiceCities.has(`${homeCity}|${homeState}`)) {
        cities.push({ city: homeCity, state: homeState });
      }
      await api('/provider/service-cities', { method: 'PUT', body: { cities } }).catch(() => {});
    }
    enterApp();
  } catch (err) {
    errorEl.textContent = err.message;
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function saveSession(newToken, newUser) {
  token = newToken;
  user = newUser;
  localStorage.setItem('chama_token', token);
  localStorage.setItem('chama_user', JSON.stringify(user));
}

function doLogout() {
  currentChatRequestId = null;
  if (chatSocket) { chatSocket.close(); chatSocket = null; }
  token = null;
  user = null;
  localStorage.removeItem('chama_token');
  localStorage.removeItem('chama_user');
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Entrar'; }
  showScreen('login');
}

// Notificação push nativa — só existe dentro do app empacotado (iOS/Android
// via Codemagic), nunca no navegador/PWA (window.Capacitor não existe lá).
// Roda em segundo plano, best-effort: se o usuário negar a permissão ou o
// plugin não estiver disponível, o app segue normal sem push, só sem esse
// aviso extra (WhatsApp e notificação dentro do app continuam funcionando).
async function initPushNotifications() {
  const FirebaseMessaging = window.Capacitor?.Plugins?.FirebaseMessaging;
  if (!FirebaseMessaging) return;
  try {
    const { receive } = await FirebaseMessaging.checkPermissions();
    if (receive !== 'granted') {
      const { receive: asked } = await FirebaseMessaging.requestPermissions();
      if (asked !== 'granted') return;
    }
    const { token } = await FirebaseMessaging.getToken();
    if (!token) return;
    const platform = window.Capacitor.getPlatform(); // 'ios' | 'android'
    await api('/notifications/push-token', { method: 'POST', body: { token, platform } });

    // Notificação chegando com o app aberto (senão só aparece quando fechado)
    // — atualiza a bolinha de novidade na hora, sem precisar reabrir o app.
    FirebaseMessaging.addListener('notificationReceived', () => refreshNotifBadge());
  } catch (err) {
    console.error('Falha ao configurar push notification:', err.message);
  }
}

async function enterApp() {
  initPushNotifications();
  providerAwaitingExpansion = false;
  if (user.role === 'provider') {
    try {
      const v = await api('/provider/verification');
      providerAwaitingExpansion = v.status === 'waiting_expansion';
    } catch { /* se falhar, segue o fluxo normal */ }
  }
  if (providerAwaitingExpansion) {
    document.getElementById('waiting-expansion-city').textContent = user.city ? `${user.city}${user.state ? '/' + user.state : ''}` : 'sua cidade';
  }
  setTab(homeScreenId());

  // Link direto (ex: avisos por WhatsApp) — depois de entrar, pula pra tela
  // pedida em vez de ficar só na home.
  const telaParam = bootParams.get('tela');
  if (telaParam === 'verificacao' && user.role === 'provider') showScreen('provider-verification');
  if (telaParam === 'trabalhos' && user.role === 'provider') setTab('provider-jobs');
  if (telaParam === 'pedidos' && user.role === 'client') setTab('my-requests');
  if (telaParam === 'assinatura' && user.role === 'provider') { showScreen('provider-subscription'); loadSubscriptionStatus(); }

  // Link direto de cobrança (botão "Lembrar cliente de pagar" no admin) —
  // pula direto pra tela de pagamento do pedido em vez de deixar o cliente
  // procurar na lista de pedidos.
  const payParam = bootParams.get('pay');
  if (payParam && user.role === 'client') openMyRequest(payParam).catch(() => {});

  // Já informou a cidade no cadastro? Usa direto como localização
  // selecionada — não faz sentido perguntar de novo algo que ele já
  // preencheu. Só entra o seletor/prompt quando não tem cidade nenhuma.
  if (user.role === 'client' && !getSelectedCity().city && user.city) {
    setSelectedCityState(user.city, user.state || '');
    loadHomeCategories();
  }

  // Primeiro acesso do cliente sem cidade nenhuma (nem no cadastro, nem
  // escolhida antes) — pede de cara em vez de deixar ele descobrir a
  // pílula "Todo o Brasil" sozinho. Só acontece uma vez (marca
  // chama_city_prompt_seen assim que mostra, mesmo que ele pule), não fica
  // repetindo login após login. Só pra quem já tem conta — visitante
  // navegando livre não pode abrir o link e cair direto numa tela de
  // localização em vez da home (ver enterGuestMode).
  if (
    token && user.role === 'client' && !telaParam &&
    !getSelectedCity().city && !localStorage.getItem('chama_city_prompt_seen')
  ) {
    localStorage.setItem('chama_city_prompt_seen', '1');
    loadCityList();
    showScreen('select-city');
  }

  // Visitante que clicou numa categoria antes de ter conta (ver
  // openRequestForm) — assim que o cadastro/login termina, reabre o
  // formulário de orçamento direto na categoria que ele já tinha escolhido,
  // em vez de deixar ele procurar de novo.
  const pendingCategoryRaw = localStorage.getItem('chama_pending_category');
  if (pendingCategoryRaw) {
    localStorage.removeItem('chama_pending_category');
    if (user.role === 'client') {
      try {
        const { catName, serviceName } = JSON.parse(pendingCategoryRaw);
        openRequestForm(catName, serviceName);
      } catch { /* payload inválido, ignora */ }
    }
  }
}

// ---------- Cache local (mostra o que já tem guardado na hora, sem esperar
// a rede — depois a busca real acontece igual sempre aconteceu e atualiza a
// tela de novo se algo mudou). Puramente aditivo: não troca a forma como os
// dados chegam, só adianta a primeira pintura da tela.
function getLocalCache(key) {
  try { return JSON.parse(localStorage.getItem('chama_cache_' + key)); } catch { return null; }
}
function setLocalCache(key, data) {
  try { localStorage.setItem('chama_cache_' + key, JSON.stringify(data)); } catch { /* localStorage cheio/indisponível, ignora */ }
}

// ---------- Home (cliente) ----------
let categoriesCacheCityKey = null;

async function ensureCategories() {
  const selectedCity = getSelectedCity();
  const cityKey = `${selectedCity.city || ''}|${selectedCity.state || ''}`;
  if (categoriesCache.length && categoriesCacheCityKey === cityKey) return categoriesCache;
  const qs = selectedCity.city
    ? `?city=${encodeURIComponent(selectedCity.city)}&state=${encodeURIComponent(selectedCity.state || '')}`
    : '';
  categoriesCache = await api(`/categories${qs}`);
  categoriesCacheCityKey = cityKey;
  return categoriesCache;
}

// Categorias com prestador aparecem primeiro (cliente vê de cara o que já dá
// pra pedir), depois ordenadas pelas mais acessadas de verdade — requestCount
// é quantos pedidos já foram criados nessa categoria (medida de demanda real,
// melhor sinal do que só visualização/clique), com número de profissionais e
// ordem alfabética como desempate. Mostra mais categorias (9 em vez de 6) pra
// dar mais opções de cara na home.
function renderHomeCategoryGrid(categories) {
  const sorted = [...categories].sort((a, b) => {
    if (a.hasProviders !== b.hasProviders) return b.hasProviders - a.hasProviders;
    if (b.requestCount !== a.requestCount) return b.requestCount - a.requestCount;
    if (b.providerCount !== a.providerCount) return b.providerCount - a.providerCount;
    return a.name.localeCompare(b.name);
  });
  document.getElementById('home-chip-grid').innerHTML = sorted.slice(0, 9).map(categoryChipHTML).join('');
}

async function loadHomeCategories() {
  const guestAuthRow = document.getElementById('guest-auth-row');
  if (guestAuthRow) guestAuthRow.style.display = token ? 'none' : 'flex';

  const selectedCity = getSelectedCity();
  document.getElementById('home-location').textContent = selectedCity.city ? `${selectedCity.city}${selectedCity.state ? ' - ' + selectedCity.state : ''}` : 'Todo o Brasil';

  // Pinta na hora com o que já tinha guardado da última visita (se tiver),
  // enquanto a busca de verdade abaixo roda igual sempre rodou.
  const cacheKey = `categories_${selectedCity.city || ''}|${selectedCity.state || ''}`;
  const cachedCategories = getLocalCache(cacheKey);
  if (cachedCategories) renderHomeCategoryGrid(cachedCategories);

  const categories = await ensureCategories();
  setLocalCache(cacheKey, categories);
  renderHomeCategoryGrid(categories);

  const howSteps = [
    { icon: '🔍', title: '1. Escolha o serviço', sub: 'Encontre o serviço que você precisa' },
    { icon: '📄', title: '2. Receba orçamentos', sub: 'Profissionais enviam seus orçamentos' },
    { icon: '💬', title: '3. Contrate', sub: 'Escolha o melhor profissional' },
    { icon: '✅', title: '4. Serviço concluído', sub: 'Avalie e aproveite o serviço' },
  ];
  document.getElementById('how-it-works-row').innerHTML = howSteps.map((s, i) => `
    ${i > 0 ? '<svg class="how-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' : ''}
    <div class="how-step"><div class="num-icon">${s.icon}</div><div class="txt"><strong>${s.title}</strong><span>${s.sub}</span></div></div>
  `).join('');

  loadHomeBanner();
}

function bannerHTML(b) {
  return `
    <a class="ad-banner" href="${b.link_url}" target="_blank" rel="noopener">
      <img src="${imgProxy(b.image_url)}" alt="${b.advertiser_name}" loading="lazy">
    </a>
  `;
}

// Banner do topo roda em carrossel quando há mais de um ativo — cada banner
// fica visível pelo tempo (display_seconds) que o admin configurou pra ele.
// O cliente também pode arrastar (swipe) pra trocar manualmente.
let topBannerCarouselTimer = null;

function renderTopBannerCarousel(containerId, banners) {
  if (topBannerCarouselTimer) { clearTimeout(topBannerCarouselTimer); topBannerCarouselTimer = null; }
  // troca o nó por um clone limpo — evita empilhar listeners de swipe a cada recarregamento da home
  let el = document.getElementById(containerId);
  const freshEl = el.cloneNode(false);
  el.replaceWith(freshEl);
  el = freshEl;

  if (!banners.length) return;
  if (banners.length === 1) { el.innerHTML = bannerHTML(banners[0]); return; }

  let index = 0;

  function show() {
    el.innerHTML = bannerHTML(banners[index]);
    if (topBannerCarouselTimer) clearTimeout(topBannerCarouselTimer);
    const seconds = banners[index].display_seconds || 5;
    topBannerCarouselTimer = setTimeout(() => { index = (index + 1) % banners.length; show(); }, seconds * 1000);
  }

  function goTo(delta) {
    index = (index + delta + banners.length) % banners.length;
    show();
  }

  let dragStartX = null;
  let dragMoved = false;
  el.addEventListener('pointerdown', (e) => { dragStartX = e.clientX; dragMoved = false; });
  el.addEventListener('pointermove', (e) => {
    if (dragStartX === null) return;
    if (Math.abs(e.clientX - dragStartX) > 10) dragMoved = true;
  });
  el.addEventListener('pointerup', (e) => {
    if (dragStartX === null) return;
    const diff = e.clientX - dragStartX;
    dragStartX = null;
    if (Math.abs(diff) > 40) goTo(diff < 0 ? 1 : -1);
  });
  el.addEventListener('click', (e) => { if (dragMoved) e.preventDefault(); });

  show();
}

function renderHomeBanners(banners) {
  const topBanners = banners.filter((b) => b.position === 'top');
  const bottom = banners.find((b) => b.position === 'bottom');
  renderTopBannerCarousel('home-banner-top', topBanners);
  document.getElementById('home-banner-bottom').innerHTML = bottom ? bannerHTML(bottom) : '';
}

async function loadHomeBanner() {
  const selectedCity = getSelectedCity();
  const cacheKey = `banners_${selectedCity.city || ''}`;
  const cachedBanners = getLocalCache(cacheKey);
  if (cachedBanners) renderHomeBanners(cachedBanners);

  const banners = await api(`/banner-ads/active?city=${encodeURIComponent(selectedCity.city || '')}`);
  setLocalCache(cacheKey, banners);
  renderHomeBanners(banners);
}

function firstNameLastInitial(name) {
  const parts = (name || '').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : (parts[0] || '');
}

function renderFeaturedProviders(providers) {
  const el = document.getElementById('featured-providers');
  el.innerHTML = providers.length ? providers.map((p) => `
    <div class="pro-card" onclick="viewProviderProfile('${p.id}','home')">
      <div class="photo-wrap">
        <img src="${avatarSrc(p)}" loading="lazy">
        <div class="verified-dot"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></div>
      </div>
      <div class="body">
        <div class="name">${firstNameLastInitial(p.name)}${p.is_founder ? ' 🏆' : ''}${p.is_subscriber ? ' ⭐' : ''}${p.featured ? '<span class="badge-featured">★</span>' : ''}</div>
        <div class="role">${(p.categories || [])[0] || 'Prestador'}</div>
        <div class="rating">★ ${p.rating_avg ? parseFloat(p.rating_avg).toFixed(1) : '—'} (${p.rating_count || 0})</div>
      </div>
    </div>
  `).join('') : '<p style="font-size:12.5px;color:var(--ink-faint);">Ainda não temos profissionais em destaque na sua região.</p>';
}

async function loadFeaturedProviders() {
  const cacheKey = 'featured_providers';
  const cachedProviders = getLocalCache(cacheKey);
  if (cachedProviders) renderFeaturedProviders(cachedProviders);

  const providers = await api('/providers/featured/list');
  setLocalCache(cacheKey, providers);
  renderFeaturedProviders(providers);
}

function statusPillHTML(status) {
  return `<span class="pill ${status}">${statusLabels[status] || status}</span>`;
}

// ---------- Notificações ----------
async function refreshNotifBadge() {
  try {
    const data = await api('/notifications');
    ['notif-badge', 'notif-badge-provider'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (data.unreadCount > 0) { el.style.display = 'flex'; el.textContent = data.unreadCount > 9 ? '9+' : data.unreadCount; }
      else el.style.display = 'none';
    });
  } catch { /* silencioso */ }
}

// Retorna o conjunto de request_id com notificação ainda não lida — usado
// pra acender a bolinha verde nos cards até o usuário abrir aquele pedido.
async function getUnreadRequestIds() {
  try {
    const data = await api('/notifications');
    return new Set(data.notifications.filter((n) => !n.read_at && n.request_id).map((n) => n.request_id));
  } catch {
    return new Set();
  }
}

async function markRequestNotificationsRead(requestId) {
  try {
    await api(`/notifications/mark-read-for-request/${requestId}`, { method: 'POST' });
    refreshNotifBadge();
  } catch { /* silencioso */ }
}

async function openNotifications() {
  if (!token) { openRegister('client'); return; }
  showScreen('notifications');
  const data = await api('/notifications');
  const el = document.getElementById('notifications-list');
  el.innerHTML = data.notifications.length ? data.notifications.map((n) => `
    <div class="list-item" onclick="markNotificationRead('${n.id}')" style="cursor:pointer;${n.read_at ? '' : 'background:var(--primary-tint);border-radius:12px;'}">
      <div class="icon" style="background:var(--primary-tint);color:var(--primary-dark);">🔔</div>
      <div class="txt"><strong>${n.title}</strong><span>${n.body || ''}</span></div>
    </div>
  `).join('') : '<div class="empty-state"><span class="glyph">🔔</span><p>Nenhuma notificação por aqui ainda.</p></div>';
}

async function markNotificationRead(id) {
  await api(`/notifications/${id}/read`, { method: 'POST' });
  refreshNotifBadge();
}

async function markAllNotificationsRead() {
  await api('/notifications/read-all', { method: 'POST' });
  openNotifications();
  refreshNotifBadge();
}

// ---------- Busca ----------
function openSearchScreen() {
  showScreen('search');
  document.getElementById('service-search-input').value = '';
  filterSearch('');
}

async function filterSearch(query) {
  const categories = await ensureCategories();
  const q = normalize(query);
  const results = document.getElementById('search-results');
  const matches = categories.filter((c) => !q || normalize(c.name).includes(q));

  results.innerHTML = matches.length
    ? matches.map(categoryChipHTML).join('')
    : `<div class="empty-state" style="grid-column:1/-1;"><span class="glyph">🔍</span><p>Nenhuma categoria encontrada para "${query}".</p></div>`;
}

// ---------- Categoria / pedido ----------
function openCategory(catName) {
  openRequestForm(catName, catName);
}

const TRIP_CATEGORIES = new Set(['Fretes & Transporte', 'Fretes e Mudanças', 'Mudanças', 'Guincho', 'Guincho & Reboque', 'Viagens', 'Motorista de App', 'Motoboy']);

async function openRequestForm(catName, serviceName) {
  // Visitante sem conta: pede cadastro AGORA, antes de abrir o formulário —
  // não faz sentido deixar ele preencher tudo (fotos, descrição) pra só
  // travar no final. Guarda a categoria escolhida pra retomar sozinho o
  // formulário assim que o cadastro/login terminar (ver enterApp).
  if (!token) {
    localStorage.setItem('chama_pending_category', JSON.stringify({ catName, serviceName }));
    openRegister('client');
    return;
  }

  const categories = await ensureCategories();
  const cat = categories.find((c) => c.name === catName);
  if (cat && !cat.hasProviders) {
    alert(`Em breve teremos prestadores disponíveis para "${catName}" na sua região. Fique de olho!`);
    return;
  }

  requestDraft = { category: catName, serviceName, preferredProviderId: null };
  document.getElementById('req-view-providers-link').style.display =
    (FIXED_PRICE_CATEGORIES.includes(catName) || KM_RATE_CATEGORIES.includes(catName)) ? '' : 'none';
  document.getElementById('req-service').value = serviceName;
  document.getElementById('req-description').value = '';
  document.getElementById('req-photos').value = '';
  document.getElementById('req-rebook-notice').style.display = 'none';

  const info = CATEGORY_INFO[catName];
  const descEl = document.getElementById('req-description');
  descEl.placeholder = info ? info.examplePlaceholder : 'Ex: descreva o serviço que você precisa';
  const chipsField = document.getElementById('req-common-services-field');
  const chipsEl = document.getElementById('req-common-services');
  if (info && info.commonServices.length) {
    chipsField.style.display = '';
    chipsEl.innerHTML = info.commonServices.map((s) => `<button type="button" class="chip-opt" onclick="document.getElementById('req-service').value='${esc(s).replace(/'/g, "\\'")}'">${esc(s)}</button>`).join('');
  } else {
    chipsField.style.display = 'none';
    chipsEl.innerHTML = '';
  }
  // Prioriza a cidade escolhida na tela inicial (localização selecionada) —
  // se o cliente já escolheu onde está navegando, o pedido deve nascer
  // nessa mesma cidade em vez de sempre voltar pro endereço de cadastro.
  const selectedCity = getSelectedCity();
  document.getElementById('req-zip').value = user.zipCode || '';
  document.getElementById('req-neighborhood').value = user.neighborhood || '';
  document.getElementById('req-city').value = selectedCity.city || user.city || '';
  document.getElementById('req-state').value = selectedCity.state || user.state || '';
  document.getElementById('request-error').textContent = '';

  const tripField = document.getElementById('req-trip-field');
  if (TRIP_CATEGORIES.has(catName)) {
    tripField.style.display = 'block';
    document.getElementById('req-trip-origin').value = '';
    document.getElementById('req-trip-destination').value = '';
    document.getElementById('req-trip-details').value = '';
  } else {
    tripField.style.display = 'none';
  }

  showScreen('request');
}

async function createRequest(btn) {
  if (btn.disabled) return;
  const errorEl = document.getElementById('request-error');
  errorEl.textContent = '';
  const neighborhood = document.getElementById('req-neighborhood').value.trim();
  const city = document.getElementById('req-city').value.trim();
  const state = document.getElementById('req-state').value.trim();
  if (!neighborhood || !city) { errorEl.textContent = 'Informe bairro e cidade.'; return; }

  const fd = new FormData();
  fd.append('category', requestDraft.category);
  fd.append('serviceName', document.getElementById('req-service').value);
  fd.append('description', document.getElementById('req-description').value);
  fd.append('zipCode', document.getElementById('req-zip').value);
  fd.append('neighborhood', neighborhood);
  fd.append('city', city);
  fd.append('state', state);
  if (TRIP_CATEGORIES.has(requestDraft.category)) {
    fd.append('tripOrigin', document.getElementById('req-trip-origin').value.trim());
    fd.append('tripDestination', document.getElementById('req-trip-destination').value.trim());
    fd.append('tripDetails', document.getElementById('req-trip-details').value.trim());
  }
  if (requestDraft.preferredProviderId) fd.append('preferredProviderId', requestDraft.preferredProviderId);
  const photos = document.getElementById('req-photos').files;
  for (const file of photos) fd.append('photos', file);

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  try {
    await api('/requests', { method: 'POST', body: fd });
    // Evento de conversão "solicitou orçamento" — content_name separa esse
    // Lead do da lista de espera no Gerenciador de Eventos da Meta, pra dar
    // pra criar uma conversão personalizada e otimizar campanha só pra quem
    // chega até aqui (maior gargalo do funil: maioria do cadastro nunca pede).
    trackConversionEvent('Lead', { content_name: 'solicitacao_orcamento', content_category: requestDraft.category });
    // A cidade do pedido passa a valer também como a "localização
    // selecionada" da tela inicial — evita ficar com duas cidades
    // desencontradas (uma pra navegar/anunciantes, outra pro pedido).
    if (city && state) setSelectedCityState(city, state);
    setTab('my-requests');
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ---------- CEP (ViaCEP) ----------
async function lookupCep(cep) {
  const clean = (cep || '').replace(/\D/g, '');
  if (clean.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const data = await res.json();
    if (data.erro) return null;
    return { street: data.logradouro, neighborhood: data.bairro, city: data.localidade, state: data.uf };
  } catch {
    return null;
  }
}

async function autoFillCep(value, context) {
  const clean = (value || '').replace(/\D/g, '');
  if (clean.length !== 8) return;
  const data = await lookupCep(clean);
  if (!data) return;

  if (context === 'client') {
    document.getElementById('reg-client-neighborhood').value = data.neighborhood;
    document.getElementById('reg-client-city').value = data.city;
    document.getElementById('reg-client-state').value = data.state;
  } else if (context === 'provider') {
    document.getElementById('reg-street').value = data.street;
    document.getElementById('reg-neighborhood').value = data.neighborhood;
    document.getElementById('reg-city').value = data.city;
    document.getElementById('reg-state').value = data.state;
  } else if (context === 'request') {
    document.getElementById('req-neighborhood').value = data.neighborhood;
    document.getElementById('req-city').value = data.city;
    document.getElementById('req-state').value = data.state;
  }
}

// ---------- Minhas solicitações (cliente) ----------
let myRequestsFilter = 'all';
const myRequestsFilterGroups = {
  all: () => true,
  pending: (r) => r.status === 'pending',
  progress: (r) => ['accepted', 'in_progress', 'awaiting_approval'].includes(r.status),
  done: (r) => r.status === 'done',
};

function setMyRequestsFilter(filter) {
  myRequestsFilter = filter;
  renderMyRequestsFilterTabs();
  loadMyRequests();
}

function renderMyRequestsFilterTabs() {
  const tabs = [
    { id: 'all', label: 'Todas' }, { id: 'pending', label: 'Aguardando propostas' },
    { id: 'progress', label: 'Em andamento' }, { id: 'done', label: 'Concluídas' },
  ];
  document.getElementById('my-requests-filter-tabs').innerHTML = tabs.map((t) => `
    <button class="${myRequestsFilter === t.id ? 'active' : ''}" onclick="setMyRequestsFilter('${t.id}')">${t.label}</button>
  `).join('');
}

async function loadMyRequests() {
  renderMyRequestsFilterTabs();
  const [allRequests, unreadRequestIds] = await Promise.all([api('/requests/mine'), getUnreadRequestIds()]);
  const requests = allRequests.filter(myRequestsFilterGroups[myRequestsFilter]);
  document.getElementById('my-requests-list').innerHTML = requests.map((r) => {
    const hasNew = unreadRequestIds.has(r.id);
    const isPending = r.status === 'pending';
    // Prestador não tem como diferenciar "cliente aceitou mas ainda não
    // pagou" de "cliente já pagou, pode começar" só pelo status do pedido
    // (os dois casos ficam "accepted") — sem isso, fica esperando sem saber
    // se o serviço já está de fato confirmado.
    const awaitingClientPayment = user.role === 'provider' && r.status === 'accepted' && r.payment_status !== 'paid';
    return `
    <div class="req-card ${hasNew ? 'has-new' : ''}" onclick="openMyRequest('${r.id}')">
      <div class="row1"><span class="title">${hasNew ? '<span class="new-dot"></span>' : ''}${r.service_name}</span>${
        hasNew && isPending ? '<span class="pill accepted">Nova proposta! Toque para ver</span>'
          : awaitingClientPayment ? '<span class="pill pending">Aguardando pagamento do cliente</span>'
          : statusPillHTML(r.status)
      }</div>
      <div class="meta-row">${dateFmt(r.created_at)} · ${r.category}${r.value ? ' · ' + money(r.value) : ''}</div>
      ${tripInfoHTML(r)}
      ${r.status === 'done' && r.provider_id ? `<button class="btn btn-ghost btn-small btn-block" style="margin-top:8px;" onclick="event.stopPropagation();rebookRequest('${r.id}')">🔁 Recontratar ${r.provider_name || ''}</button>` : ''}
    </div>
  `;
  }).join('') || '<div class="empty-state"><span class="glyph">📭</span><p>Nenhuma solicitação por aqui.</p></div>';
}

async function openMyRequest(requestId) {
  markRequestNotificationsRead(requestId);
  const r = await api(`/requests/${requestId}`);
  if (r.status === 'pending') {
    openProposalsScreen(r);
  } else if (r.status === 'awaiting_approval' || r.status === 'accepted' || r.status === 'in_progress' || r.status === 'done') {
    await renderConfirmFromRequest(r);
    showScreen('confirm');
  } else {
    showScreen('my-requests');
  }
}

// Botão "Recontratar" num pedido já concluído — abre o formulário de novo
// pedido já preenchido com a mesma categoria/serviço/descrição, e guarda o
// prestador anterior como preferido: ele recebe um aviso direto (ver POST
// /requests), e se o pagamento for confirmado o cliente ganha um cashback
// em moedas por recontratar pela plataforma (ver services/loyalty.js).
async function rebookRequest(requestId) {
  const r = await api(`/requests/${requestId}`);
  await openRequestForm(r.category, r.service_name);
  requestDraft.preferredProviderId = r.provider_id;
  document.getElementById('req-description').value = r.description || '';
  const notice = document.getElementById('req-rebook-notice');
  document.getElementById('req-rebook-notice-text').textContent = `Recontratando ${r.provider_name || 'este prestador'} — ele vai receber um aviso direto do seu pedido.`;
  notice.style.display = 'flex';
}

// ---------- Propostas ----------
async function openProposalsScreen(r) {
  currentChat = { requestId: r.id };
  document.getElementById('proposals-subtitle').textContent = `${r.service_name} · ${r.category}`;
  const proposals = await api(`/requests/${r.id}/proposals`);
  document.getElementById('proposals-list').innerHTML = proposals.length
    ? proposals.map((p) => proposalTicketHTML(r, p)).join('')
    : '<div class="empty-state"><span class="glyph">⏳</span><p>Ainda sem propostas. Prestadores da região serão notificados.</p></div>';
  document.getElementById('cancel-request-btn').onclick = () => cancelRequest(r.id);
  showScreen('proposals');
}

async function cancelRequest(requestId) {
  if (!confirm('Tem certeza que quer cancelar esse pedido? Quem já enviou proposta será avisado.')) return;
  try {
    await api(`/requests/${requestId}/cancel`, { method: 'POST' });
    setTab('my-requests');
  } catch (err) {
    alert(err.message);
  }
}

function proposalTicketHTML(r, p) {
  const rating = parseFloat(p.rating_avg) || 0;
  return `
    <div class="ticket">
      <div class="ticket-row">
        <div class="avatar">${avatarBoxHTML(p.provider_name, p.provider_photo_url)}</div>
        <div class="ticket-info">
          <div class="name-row"><span class="name">${p.provider_name}</span>${p.is_founder ? '<span class="badge-founder">🏆 Fundador</span>' : ''}${p.is_subscriber ? '<span class="badge-pro">⭐ PRO</span>' : ''}${p.featured ? '<span class="badge-featured">Proposta em destaque</span>' : (p.provider_featured ? '<span class="badge-featured">Destaque</span>' : '')}</div>
          <div class="stars">${'★'.repeat(Math.round(rating)) || '—'} ${rating ? rating.toFixed(1) : ''} · ${p.rating_count || 0} serviços</div>
        </div>
      </div>
      <div class="ticket-divider"></div>
      <div class="ticket-meta">
        <span class="price">${money(p.value)}</span>
        <span class="prazo">${p.availability || ''}</span>
      </div>
      ${p.notes ? `<div style="font-size:12.5px;color:var(--ink-soft);margin:2px 0 8px;">${p.notes}</div>` : ''}
      <div class="ticket-actions">
        <button class="btn btn-ghost" onclick="viewProviderProfile('${p.provider_id}')">Ver perfil</button>
        <button class="btn btn-ghost" onclick="openChatThread('${r.id}','${p.provider_id}','${p.provider_name.replace(/'/g, "\\'")}')">💬 Mensagem</button>
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:10px;" onclick="acceptProposal(this,'${r.id}','${p.id}','${p.provider_name.replace(/'/g, "\\'")}',${p.value})">Aceitar</button>
    </div>
  `;
}

let viewedProviderId = null;
let providerViewReturnScreen = 'proposals';

async function viewProviderProfile(providerId, returnTo = 'proposals') {
  if (!providerId || providerId === 'null' || providerId === 'undefined') {
    alert('Não foi possível abrir esse perfil. Tente novamente.');
    return;
  }
  viewedProviderId = providerId;
  providerViewReturnScreen = returnTo;
  document.getElementById('provider-view-content').innerHTML = '<div class="empty-state" style="padding:40px 20px;"><p>Carregando perfil...</p></div>';
  showScreen('provider-view');
  const [p, isFavorited, catalogItems, kmRates, cities] = await Promise.all([
    api(`/providers/${providerId}`),
    token && user.role === 'client' ? checkFavorited(providerId) : Promise.resolve(false),
    api(`/providers/${providerId}/catalog`).catch(() => []),
    api(`/providers/${providerId}/km-rates`).catch(() => []),
    availableCitiesCache.length ? Promise.resolve(availableCitiesCache) : api('/cities/active').catch(() => []),
  ]);
  availableCitiesCache = cities;
  const rating = parseFloat(p.rating_avg) || 0;
  providerCatalogViewState = {};
  providerCatalogItemsById = {};
  catalogItems.forEach((it) => { providerCatalogViewState[it.id] = 0; providerCatalogItemsById[it.id] = it; });
  const catalogByCategory = {};
  catalogItems.forEach((it) => { (catalogByCategory[it.category] = catalogByCategory[it.category] || []).push(it); });
  // Taxa de deslocamento só entra na conta se o cliente for de cidade
  // diferente da do prestador — mesma regra usada no checkout do backend.
  const rawTravelFee = parseFloat(p.catalog_travel_fee) || 0;
  const isDifferentCity = user?.city && p.city && (normalize(user.city) !== normalize(p.city) || user.state !== p.state);
  providerCatalogTravelFee = rawTravelFee > 0 && isDifferentCity ? rawTravelFee : 0;
  document.getElementById('provider-view-content').innerHTML = `
    <div class="profile-hero">
      <img class="avatar-lg" src="${avatarSrc(p)}" loading="lazy">
      <div class="info">
        <h3>${p.name}${p.is_founder ? '<span class="badge-founder">🏆 Fundador</span>' : ''}${p.is_subscriber ? '<span class="badge-pro">⭐ PRO</span>' : ''}${p.criminal_record_status === 'approved' ? '<span class="badge-founder" title="Certidão de antecedentes criminais verificada">🛡️ Antecedentes verificados</span>' : ''}${p.featured ? '<span class="badge-featured">Destaque</span>' : ''}<span class="role-badge">${p.level || 'Bronze'}</span></h3>
        <div class="contact-line">${(p.categories || []).join(', ') || 'Prestador de serviços'}</div>
      </div>
    </div>
    ${token && user.role === 'client' ? `<button class="btn ${isFavorited ? 'btn-primary' : 'btn-ghost'} btn-block" id="favorite-toggle-btn" onclick="toggleFavorite('${providerId}')">${isFavorited ? '♥ Favoritado' : '♡ Favoritar'}</button>` : `<button class="btn btn-ghost btn-block" onclick="openRegister('client')">Criar conta pra favoritar</button>`}
    <div class="stat-grid" style="margin-top:16px;">
      <div class="stat-box"><div class="num">${rating ? rating.toFixed(1) : '—'}</div><div class="lab">Nota</div></div>
      <div class="stat-box"><div class="num">${p.rating_count || 0}</div><div class="lab">Avaliações</div></div>
      <div class="stat-box"><div class="num">${p.completed_count}</div><div class="lab">Concluídos</div></div>
    </div>
    ${Object.keys(catalogByCategory).length ? Object.entries(catalogByCategory).map(([cat, items]) => `
      <div class="section-title" style="margin-top:16px;"><h3>Contratar agora — ${cat}</h3></div>
      <p style="font-size:12.5px;color:var(--ink-soft);margin-top:0;">Preço fixo, sem precisar esperar proposta.</p>
      ${items.map((it) => `
        <div style="display:flex;align-items:center;gap:8px;border:1.5px solid var(--line);border-radius:11px;padding:10px 12px;margin-bottom:8px;">
          <div style="flex:1;">
            <div style="font-size:13.5px;font-weight:700;">${it.name}</div>
            <div style="font-size:12px;color:var(--ink-soft);">${money(it.price)} por ${it.unit}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;background:var(--bg-soft, #F3F4F6);border-radius:20px;padding:4px 8px;">
            <span style="cursor:pointer;color:var(--ink-soft);font-size:16px;font-weight:700;padding:0 4px;" onclick="adjustCatalogQty('${it.id}','${cat.replace(/'/g, "\\'")}',-1)">−</span>
            <span id="catalog-qty-${it.id}" style="min-width:14px;text-align:center;font-size:13px;font-weight:700;">0</span>
            <span style="cursor:pointer;color:var(--primary);font-size:16px;font-weight:700;padding:0 4px;" onclick="adjustCatalogQty('${it.id}','${cat.replace(/'/g, "\\'")}',1)">+</span>
          </div>
        </div>
      `).join('')}
      ${providerCatalogTravelFee > 0 ? `<p style="font-size:11.5px;color:var(--ink-faint);margin:0 0 4px;">+ ${money(providerCatalogTravelFee)} de taxa de deslocamento (cidade diferente da do prestador), incluída no total abaixo.</p>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 2px 10px;">
        <span style="font-size:12.5px;color:var(--ink-soft);">Total</span>
        <span id="catalog-total-${cssId(cat)}" style="font-size:16px;font-weight:700;">${money(providerCatalogTravelFee)}</span>
      </div>
      <button class="btn btn-primary btn-block" onclick="checkoutProviderCatalog('${providerId}','${cat.replace(/'/g, "\\'")}','${p.name.replace(/'/g, "\\'")}')">Contratar agora</button>
    `).join('') : ''}
    ${kmRates.length ? kmRates.map((r) => `
      <div class="section-title" style="margin-top:16px;"><h3>Contratar agora — ${r.category}</h3></div>
      <p style="font-size:12.5px;color:var(--ink-soft);margin-top:0;">Escolha origem e destino — o valor é calculado na hora (R$ ${Number(r.price_per_km).toFixed(2).replace('.', ',')}/km${parseFloat(r.base_fee) > 0 ? ` + R$ ${Number(r.base_fee).toFixed(2).replace('.', ',')} de taxa fixa` : ''}).</p>
      <div class="field"><label>Cidade de origem</label>
        <select id="km-origin-${cssId(r.category)}">${availableCitiesCache.map((c) => `<option value="${c.city}|${c.state}">${c.city}/${c.state}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Cidade de destino</label>
        <select id="km-dest-${cssId(r.category)}">${availableCitiesCache.map((c) => `<option value="${c.city}|${c.state}">${c.city}/${c.state}</option>`).join('')}</select>
      </div>
      <button class="btn btn-ghost btn-block btn-small" onclick="quoteKmRate('${providerId}','${r.category.replace(/'/g, "\\'")}','${p.name.replace(/'/g, "\\'")}')">Ver preço</button>
      <div id="km-quote-result-${cssId(r.category)}" style="margin-top:8px;"></div>
    `).join('') : ''}
    ${p.bio ? `<div class="section-title"><h3>Sobre</h3></div><p style="font-size:13.5px;color:var(--ink-soft);">${p.bio}</p>` : ''}
    ${p.portfolio && p.portfolio.length ? `
      <div class="section-title"><h3>Trabalhos realizados</h3></div>
      <div class="portfolio-grid">${p.portfolio.map((ph) => `<div class="portfolio-item"><img src="${imgProxy(ph.photo_url)}" loading="lazy"></div>`).join('')}</div>
    ` : ''}
    <div class="section-title"><h3>Avaliações</h3></div>
    ${p.reviews && p.reviews.length ? `
      <div class="review-list">${p.reviews.map((rv) => `
        <div class="req-card" style="cursor:default;">
          <div class="row" style="justify-content:space-between;align-items:center;">
            <div>${'★'.repeat(rv.rating)}${'☆'.repeat(5 - rv.rating)}</div>
            <div style="font-size:12px;color:var(--ink-soft);">${rv.client_name}</div>
          </div>
          ${rv.comment ? `<p style="font-size:13.5px;color:var(--ink-soft);margin-top:6px;">${rv.comment}</p>` : ''}
        </div>
      `).join('')}</div>
    ` : `<div class="empty-state" style="padding:20px;"><p>Ainda sem avaliações públicas.</p></div>`}
  `;
}

let providerCatalogViewState = {};
let providerCatalogItemsById = {};
let providerCatalogTravelFee = 0;

function adjustCatalogQty(itemId, category, delta) {
  const current = providerCatalogViewState[itemId] || 0;
  providerCatalogViewState[itemId] = Math.max(0, current + delta);
  document.getElementById(`catalog-qty-${itemId}`).textContent = providerCatalogViewState[itemId];
  const itemsTotal = Object.entries(providerCatalogViewState)
    .filter(([id]) => providerCatalogItemsById[id]?.category === category)
    .reduce((sum, [id, qty]) => sum + qty * parseFloat(providerCatalogItemsById[id].price), 0);
  const totalEl = document.getElementById(`catalog-total-${cssId(category)}`);
  if (totalEl) totalEl.textContent = money(itemsTotal + providerCatalogTravelFee);
}

async function checkoutProviderCatalog(providerId, category, providerName) {
  const items = Object.entries(providerCatalogViewState)
    .filter(([id, qty]) => qty > 0 && providerCatalogItemsById[id]?.category === category)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
  if (items.length === 0) { alert('Escolha a quantidade de pelo menos um item.'); return; }
  try {
    const created = await api(`/providers/${providerId}/catalog/checkout`, { method: 'POST', body: { category, items } });
    goToPaymentScreen(created, providerName);
  } catch (err) {
    alert(err.message);
  }
}

async function quoteKmRate(providerId, category, providerName) {
  const resultEl = document.getElementById(`km-quote-result-${cssId(category)}`);
  resultEl.innerHTML = '<p style="font-size:12.5px;color:var(--ink-soft);">Calculando...</p>';
  const [originCity, originState] = document.getElementById(`km-origin-${cssId(category)}`).value.split('|');
  const [destCity, destState] = document.getElementById(`km-dest-${cssId(category)}`).value.split('|');
  try {
    const quote = await api(`/providers/${providerId}/km-rate/quote`, {
      method: 'POST', body: { category, originCity, originState, destCity, destState },
    });
    resultEl.innerHTML = `
      <p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 6px;">${quote.distanceKm} km — total estimado</p>
      ${quote.minimumApplied ? `<p style="font-size:11.5px;color:var(--ink-faint);margin:0 0 6px;">Valor mínimo de pedido aplicado.</p>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:12.5px;color:var(--ink-soft);">Total</span>
        <span style="font-size:16px;font-weight:700;">${money(quote.price)}</span>
      </div>
      <button class="btn btn-primary btn-block" onclick="checkoutKmRate('${providerId}','${category.replace(/'/g, "\\'")}','${providerName.replace(/'/g, "\\'")}')">Contratar agora</button>
    `;
  } catch (err) {
    resultEl.innerHTML = `<p style="font-size:12.5px;color:var(--danger);">${err.message}</p>`;
  }
}

async function checkoutKmRate(providerId, category, providerName) {
  const [originCity, originState] = document.getElementById(`km-origin-${cssId(category)}`).value.split('|');
  const [destCity, destState] = document.getElementById(`km-dest-${cssId(category)}`).value.split('|');
  try {
    const created = await api(`/providers/${providerId}/km-rate/checkout`, {
      method: 'POST', body: { category, originCity, originState, destCity, destState },
    });
    goToPaymentScreen(created, providerName);
  } catch (err) {
    alert(err.message);
  }
}

async function checkFavorited(providerId) {
  try {
    const favs = await api('/providers/favorites/mine');
    return favs.some((f) => f.id === providerId);
  } catch { return false; }
}

async function toggleFavorite(providerId) {
  const btn = document.getElementById('favorite-toggle-btn');
  const isFav = btn.textContent.includes('Favoritado');
  await api(`/providers/${providerId}/favorite`, { method: isFav ? 'DELETE' : 'POST' });
  btn.classList.toggle('btn-primary', !isFav);
  btn.classList.toggle('btn-ghost', isFav);
  btn.textContent = isFav ? '♡ Favoritar' : '♥ Favoritado';
}

async function acceptProposal(btn, requestId, proposalId, providerName, value) {
  if (btn.disabled) return;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Aceitando...';
  try {
    await api(`/requests/${requestId}/proposals/${proposalId}/accept`, { method: 'POST' });
    const updated = await api(`/requests/${requestId}`);
    goToPaymentScreen(updated, providerName);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = originalText;
    alert(err.message);
  }
}

// Extraído de acceptProposal() pra poder ser chamado também a partir da tela
// de detalhes do pedido — um pedido aceito mas ainda não pago (ex: cliente
// saiu da tela antes de pagar) precisa de um jeito de voltar pro pagamento.
function goToPaymentScreen(updated, providerName) {
  document.getElementById('pay-total').textContent = money(updated.value);
  document.getElementById('pay-details').textContent = `${updated.service_name} · ${providerName}`;
  currentChat = { requestId: updated.id, otherName: providerName, otherId: updated.provider_id, address: updated.address };
  appliedCoupon = null;
  document.getElementById('coupon-input').value = '';
  document.getElementById('coupon-error').textContent = '';
  document.getElementById('pay-discount-row').style.display = 'none';
  selectedInstallments = 1;
  document.getElementById('installments-select').value = '1';
  installmentsEligible = !!updated.allow_installments && parseFloat(updated.value) >= MIN_INSTALLMENT_AMOUNT;
  paymentInFlight = false;
  const btn = document.getElementById('confirm-payment-btn');
  btn.disabled = false;
  btn.textContent = 'Pagar e confirmar serviço';
  showScreen('payment');
  selectPayMethod(document.querySelector('.screen[data-screen="payment"] .pay-method[data-method="pix"]'));

  // Crédito de carteira (ganho num cancelamento anterior por culpa do
  // prestador) abate automático na hora de pagar — só avisa aqui, quem
  // calcula o valor final de verdade é o backend em POST /requests/:id/pay.
  const creditRow = document.getElementById('pay-credit-row');
  creditRow.style.display = 'none';
  api('/my-credit').then((c) => {
    if (c.balance > 0) {
      creditRow.style.display = 'block';
      const abatido = Math.min(c.balance, parseFloat(updated.value));
      creditRow.textContent = `💰 Você tem ${money(c.balance)} de crédito — ${money(abatido)} será usado automaticamente neste pagamento`;
    }
  }).catch(() => {});
}

async function payNow(requestId) {
  const r = await api(`/requests/${requestId}`);
  goToPaymentScreen(r, r.provider_name);
}

// ---------- Pagamento ----------
let appliedCoupon = null;

async function applyCoupon() {
  const errorEl = document.getElementById('coupon-error');
  const discountRow = document.getElementById('pay-discount-row');
  errorEl.textContent = '';
  const code = document.getElementById('coupon-input').value.trim();
  if (!code) { errorEl.textContent = 'Informe um código de cupom.'; return; }

  try {
    const result = await api(`/requests/${currentChat.requestId}/coupon/preview`, { method: 'POST', body: { code } });
    appliedCoupon = { code, discountValue: result.discountValue, newTotal: result.newTotal };
    discountRow.style.display = 'block';
    discountRow.textContent = `Cupom aplicado: -${money(result.discountValue)} · Novo total: ${money(result.newTotal)}`;
  } catch (err) {
    appliedCoupon = null;
    discountRow.style.display = 'none';
    errorEl.textContent = err.message;
  }
}

function selectPayMethod(el) {
  document.querySelectorAll('.screen[data-screen="payment"] .pay-method').forEach((m) => m.classList.remove('selected'));
  el.classList.add('selected');
  payMethod = el.dataset.method;
  document.getElementById('card-fields').style.display = payMethod === 'credit_card' ? 'block' : 'none';
  const showInstallments = payMethod === 'credit_card' && installmentsEligible;
  document.getElementById('installments-field').style.display = showInstallments ? 'block' : 'none';
  if (!showInstallments) { selectedInstallments = 1; document.getElementById('installments-select').value = '1'; }
  else updateInstallmentsPreview();
  // O botão só gera o QR Code no Pix — não paga sozinho. Texto diferente pra
  // não dar a impressão de que clicar já fecha o serviço (era exatamente
  // essa confusão que fazia gente pular a etapa de pagar de verdade).
  document.getElementById('confirm-payment-btn').textContent = payMethod === 'pix' ? 'Gerar Pix para pagamento' : 'Pagar e confirmar serviço';
}

// Mesma fórmula do backend (src/config/anticipation.js) — parcelar libera o
// valor pro prestador na hora em vez de esperar as parcelas (antecipação
// automática, já ligada na conta), e esse custo é embutido no total cobrado
// do cliente. Duplicado aqui só pra mostrar o valor certo ANTES de pagar;
// quem calcula o valor de verdade cobrado é sempre o backend.
const ANTICIPATION_RATE_MONTHLY = 0.016;
function estimateParceladoSurchargePct(installments) {
  return installments * ANTICIPATION_RATE_MONTHLY;
}

function updateInstallmentsPreview() {
  selectedInstallments = parseInt(document.getElementById('installments-select').value, 10);
  const total = parseFloat((document.getElementById('pay-total').textContent || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  const preview = document.getElementById('installments-preview');
  if (selectedInstallments > 1) {
    const surchargePct = estimateParceladoSurchargePct(selectedInstallments);
    const totalComJuros = total * (1 + surchargePct);
    preview.innerHTML = `${selectedInstallments}x de ${money(totalComJuros / selectedInstallments)} — total ${money(totalComJuros)} (+${(surchargePct * 100).toFixed(1)}% pela antecipação automática do pagamento, cobrada pela operadora)`;
  } else {
    preview.textContent = '';
  }
}

function pixQrBoxHTML(qrCodeUrl, pixCopyPaste) {
  return `
    <div class="qr-box">
      <p style="font-size:12.5px;">Escaneie o QR Code com o app do seu banco:</p>
      <img src="${qrCodeUrl}" alt="QR Code Pix" style="width:200px;height:200px;display:block;margin:10px auto;border-radius:8px;">
      ${pixCopyPaste ? `
        <p style="font-size:12.5px;margin-top:10px;">Ou use o Pix Copia e Cola:</p>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <input id="pix-copy-paste-input" value="${pixCopyPaste}" readonly style="flex:1;font-size:11px;" onclick="this.select();">
          <button class="btn btn-ghost btn-small" onclick="copyPixCode()">Copiar</button>
        </div>
      ` : ''}
    </div>
  `;
}

function copyPixCode() {
  const input = document.getElementById('pix-copy-paste-input');
  if (!input) return;
  input.select();
  navigator.clipboard?.writeText(input.value).catch(() => document.execCommand('copy'));
}

let paymentInFlight = false;

async function confirmPayment() {
  if (paymentInFlight) return; // trava contra duplo clique/toque — evita cobrar duas vezes
  paymentInFlight = true;
  const btn = document.getElementById('confirm-payment-btn');
  const originalBtnText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Processando...';

  const errorEl = document.getElementById('payment-error');
  errorEl.textContent = '';
  const requestId = currentChat.requestId;

  const body = { paymentMethod: payMethod };
  if (appliedCoupon) body.couponCode = appliedCoupon.code;
  if (payMethod === 'credit_card') {
    const [expMonth, expYear] = (document.getElementById('card-expiry').value || '').split('/');
    body.card = {
      number: document.getElementById('card-number').value.replace(/\s/g, ''),
      holderName: document.getElementById('card-holder').value,
      expMonth: parseInt(expMonth, 10),
      expYear: parseInt(expYear, 10),
      cvv: document.getElementById('card-cvv').value,
    };
    body.billingAddress = {
      line1: currentChat.address || user.street || 'Não informado',
      zipCode: (document.getElementById('card-zip').value || '').replace(/\D/g, ''),
      city: user.city || 'Não informado', state: user.state || 'PR',
    };
    if (selectedInstallments > 1) body.installments = selectedInstallments;
  }

  try {
    const result = await api(`/requests/${requestId}/pay`, { method: 'POST', body });
    lastPaymentContext = currentChat;
    if (result.transaction?.status === 'paid') {
      trackConversionEvent('Purchase', { value: parseFloat(result.transaction.amount), currency: 'BRL' });
    }

    const r = await api(`/requests/${requestId}`);
    await renderConfirmFromRequest(r);
    const pixPending = payMethod === 'pix' && !!result.qrCodeUrl;
    document.getElementById('confirm-title').textContent = pixPending ? '⚠️ Falta pagar o Pix!' : 'Pagamento confirmado';
    document.getElementById('confirm-sub').textContent = pixPending
      ? 'O serviço só é confirmado depois que você pagar. Escaneie o QR Code ou copie o código Pix abaixo agora.'
      : 'O prestador foi avisado. Combine os detalhes finais pelo chat.';
    document.getElementById('qr-container').innerHTML = result.qrCodeUrl
      ? `${pixPending ? '<div class="fee-note" style="background:var(--danger-tint);color:var(--danger);font-weight:700;"><span>⚠️</span><span>Isso ainda não confirmou o serviço — pague o Pix abaixo pra concluir.</span></div>' : ''}${pixQrBoxHTML(result.qrCodeUrl, result.pixCopyPaste)}`
      : '';
    showScreen('confirm');
  } catch (err) {
    errorEl.textContent = err.message;
    btn.disabled = false;
    btn.textContent = originalBtnText;
    paymentInFlight = false;
  }
}

function feeBreakdownHTML(tx) {
  if (!tx) return '';
  if (user.role !== 'provider') {
    const clientStatusLabels = { paid: 'Pago', pending: 'Aguardando confirmação do pagamento', failed: 'Pagamento falhou', refunded: 'Reembolsado' };
    // Parcelado: o valor do serviço não é o mesmo que foi cobrado no cartão —
    // a sobretaxa de antecipação (ver src/config/anticipation.js) é somada em
    // cima. Mostra os dois separados pra bater com o extrato do cartão.
    const surcharge = tx.installments > 1 ? parseFloat(tx.anticipation_fee_estimated) || 0 : 0;
    return `
      <div class="summary-row"><span>Valor do serviço</span><span>${money(tx.amount)}</span></div>
      ${surcharge > 0 ? `
        <div class="summary-row"><span>Antecipação automática (parcelado em ${tx.installments}x)</span><span>+ ${money(surcharge)}</span></div>
        <div class="summary-row"><span>Total cobrado no cartão</span><span>${money(parseFloat(tx.amount) + surcharge)}</span></div>
      ` : ''}
      <div class="summary-row"><span>Situação do pagamento</span><span>${clientStatusLabels[tx.status] || tx.status}</span></div>
    `;
  }
  const paymentStatusLabels = { paid: tx.released_at ? 'Pago — liberado ao prestador' : 'Pago — retido até aprovação', pending: 'Aguardando confirmação do pagamento', failed: 'Pagamento falhou', refunded: 'Reembolsado' };
  const gatewayFee = parseFloat(tx.gateway_fee_value) || 0;
  // No à vista a antecipação (recebimento antes do prazo normal do cartão)
  // vem embutida no gatewayFee e sai do repasse — separa aqui só pra deixar
  // claro o que é cada taxa. No parcelado quem paga a antecipação é o
  // cliente (não desconta daqui), por isso só mostra quando installments==1.
  const anticipationFee = tx.installments === 1 ? (parseFloat(tx.anticipation_fee_estimated) || 0) : 0;
  const cardProcessingFee = gatewayFee - anticipationFee;
  return `
    <div class="summary-row"><span>Valor total</span><span>${money(tx.amount)}</span></div>
    <div class="summary-row"><span>Taxa da plataforma (${tx.commission_rate}%)</span><span>- ${money(tx.commission_value)}</span></div>
    ${cardProcessingFee > 0 ? `<div class="summary-row"><span>Taxa de processamento (${tx.payment_method === 'pix' ? 'Pix' : 'cartão'})</span><span>- ${money(cardProcessingFee)}</span></div>` : ''}
    ${anticipationFee > 0 ? `<div class="summary-row"><span>Antecipação automática (cartão à vista)</span><span>- ${money(anticipationFee)}</span></div>` : ''}
    <div class="summary-row"><span>Repasse ao prestador</span><span>${money(tx.net_value)}</span></div>
    <div class="summary-row"><span>Situação do pagamento</span><span>${paymentStatusLabels[tx.status] || tx.status}</span></div>
  `;
}

async function renderConfirmFromRequest(r) {
  document.getElementById('confirm-title').textContent = statusLabels[r.status] || r.status;
  document.getElementById('confirm-sub').textContent = 'Acompanhe os detalhes do seu pedido.';
  document.getElementById('qr-container').innerHTML = '';

  let tx = null;
  try { tx = await api(`/requests/${r.id}/transaction`); } catch { /* ainda sem pagamento registrado */ }

  document.getElementById('confirm-summary').innerHTML = `
    <div class="summary-row"><span>Serviço</span><span>${r.service_name}</span></div>
    <div class="summary-row"><span>Status</span><span>${statusLabels[r.status] || r.status}</span></div>
  ` + (tx ? feeBreakdownHTML(tx) : `<div class="summary-row"><span>Valor</span><span>${money(r.value)}</span></div>`);

  currentChat = { requestId: r.id, otherId: r.provider_id };
  lastPaymentContext = currentChat;

  document.getElementById('confirm-chat-btn').textContent = user.role === 'provider' ? 'Enviar mensagem ao cliente' : 'Enviar mensagem ao prestador';
  // Chat só libera depois do pagamento confirmado — evita cliente e prestador
  // combinarem tudo por fora antes de pagar.
  document.getElementById('confirm-chat-btn').style.display = (tx && tx.status === 'paid') ? 'block' : 'none';

  const actions = document.getElementById('confirm-actions');
  let actionsHtml = '';

  if (r.status === 'accepted' && user.role === 'client' && (!tx || tx.status === 'failed')) {
    actionsHtml += `<div style="margin-bottom:14px;"><button class="btn btn-primary btn-block" onclick="payNow('${r.id}')">Pagar agora</button></div>`;
    actionsHtml += `<div style="margin-bottom:14px;"><button class="btn btn-ghost btn-block" style="color:var(--danger);border-color:var(--danger);" onclick="cancelRequest('${r.id}')">Cancelar pedido</button></div>`;
  } else if (r.status === 'accepted' && user.role === 'client' && tx?.status === 'pending' && tx.payment_method === 'pix') {
    actionsHtml += `<div style="margin-bottom:14px;"><button class="btn btn-ghost btn-block" onclick="payNow('${r.id}')">Já paguei / tentar outro método</button></div>`;
  }

  if (r.status === 'awaiting_approval' && user.role === 'client') {
    actionsHtml += `<div style="margin-bottom:14px;"><button class="btn btn-primary btn-block" onclick="approveCompletion('${r.id}', '${(r.provider_name || '').replace(/'/g, "\\'")}')">Aprovar conclusão e liberar pagamento</button></div>`;
  }

  if (user.role === 'client' && tx && tx.status === 'paid' && !r.street) {
    actionsHtml += `
      <div class="card" style="margin-bottom:14px;">
        <strong style="font-size:14px;">Complete o endereço</strong>
        <p style="font-size:12.5px;color:var(--ink-soft);margin:6px 0 10px;">Agora que o pagamento foi feito, informe rua e número pro prestador chegar até você.</p>
        <div class="field"><label>Rua</label><input id="full-address-street"></div>
        <div style="display:flex;gap:10px;">
          <div class="field" style="flex:1;"><label>Número</label><input id="full-address-number"></div>
          <div class="field" style="flex:1;"><label>Complemento</label><input id="full-address-complement"></div>
        </div>
        <button class="btn btn-primary btn-block btn-small" onclick="saveFullAddress('${r.id}')">Salvar endereço</button>
        <div class="error-msg" id="full-address-error"></div>
      </div>
    `;
  } else if (r.street) {
    actionsHtml += `
      <div class="card" style="margin-bottom:14px;">
        <strong style="font-size:14px;">Endereço completo</strong>
        <p style="font-size:12.5px;color:var(--ink-soft);margin:6px 0 0;">${r.street}, ${r.street_number}${r.complement ? ' - ' + r.complement : ''} — ${r.neighborhood}, ${r.city}</p>
      </div>
    `;
  }

  if (user.role === 'provider') {
    actionsHtml += '<div id="contact-unlock-slot" style="margin-bottom:14px;"></div>';
  }

  actions.innerHTML = actionsHtml;

  if (user.role === 'provider') loadContactUnlockCard(r.id);
}

// Telefone do cliente só aparece pra quem assina o Plano PRO (libera sozinho
// assim que o pagamento é confirmado). Quem não assina usa o chat do app —
// já visível acima assim que o pagamento é confirmado — que filtra contato
// do texto automaticamente.
async function loadContactUnlockCard(requestId) {
  const slot = document.getElementById('contact-unlock-slot');
  if (!slot) return;
  try {
    const data = await api(`/provider/contact-unlock/${requestId}`);
    if (data.unlocked) {
      slot.innerHTML = `
        <div class="card">
          <strong style="font-size:14px;">Contato do cliente</strong>
          <p style="font-size:13px;color:var(--ink-soft);margin:6px 0 0;">${data.name} · ${data.phone || 'telefone não informado'}</p>
        </div>
      `;
    } else if (data.paymentRequired) {
      slot.innerHTML = `
        <div class="card">
          <strong style="font-size:14px;">Contato do cliente</strong>
          <p style="font-size:12.5px;color:var(--ink-soft);margin:6px 0 0;">${data.isSubscriber ? 'Como assinante do Plano PRO, você vai ver o telefone deste cliente automaticamente assim que o pagamento for confirmado.' : 'Assim que o pagamento for confirmado, você pode conversar com o cliente pelo chat aqui no app.'}</p>
        </div>
      `;
    } else if (data.quotaExceeded) {
      slot.innerHTML = `
        <div class="card">
          <strong style="font-size:14px;">Contato do cliente</strong>
          <p style="font-size:12.5px;color:var(--ink-soft);margin:6px 0 10px;">Você já usou seus ${data.freeUnlocksUsed} contatos grátis do Plano PRO este mês (limite: ${data.freeUnlocksLimit}). Pode liberar este por ${data.coinUnlockCost} moedas, ou combinar pelo chat do app.</p>
          <div class="error-msg" id="contact-unlock-error-${requestId}"></div>
          <button class="btn btn-primary btn-block btn-small" onclick="unlockContactWithCoins('${requestId}')">Liberar por ${data.coinUnlockCost} moedas</button>
        </div>
      `;
    } else if (data.isSubscriber) {
      slot.innerHTML = `
        <div class="card">
          <strong style="font-size:14px;">Contato do cliente</strong>
          <p style="font-size:12.5px;color:var(--ink-soft);margin:6px 0 0;">Carregando o telefone deste cliente...</p>
        </div>
      `;
      setTimeout(() => loadContactUnlockCard(requestId), 1500);
    } else {
      slot.innerHTML = `
        <div class="card">
          <strong style="font-size:14px;">Contato do cliente</strong>
          <p style="font-size:12.5px;color:var(--ink-soft);margin:6px 0 10px;">Use o botão "Enviar mensagem" acima pra combinar os detalhes com o cliente pelo chat do app. Assinantes do Plano PRO recebem o telefone automaticamente após o pagamento.</p>
          <button class="btn btn-ghost btn-block btn-small" onclick="showScreen('provider-subscription'); loadSubscriptionStatus();">Conhecer o Plano PRO</button>
        </div>
      `;
    }
  } catch { slot.innerHTML = ''; }
}

async function unlockContactWithCoins(requestId) {
  const errorEl = document.getElementById(`contact-unlock-error-${requestId}`);
  try {
    await api(`/provider/contact-unlock/${requestId}`, { method: 'POST' });
    await loadContactUnlockCard(requestId);
  } catch (err) {
    if (errorEl) errorEl.textContent = err.message;
  }
}

async function saveFullAddress(requestId) {
  const errorEl = document.getElementById('full-address-error');
  errorEl.textContent = '';
  const street = document.getElementById('full-address-street').value.trim();
  const streetNumber = document.getElementById('full-address-number').value.trim();
  const complement = document.getElementById('full-address-complement').value.trim();
  if (!street || !streetNumber) { errorEl.textContent = 'Informe rua e número.'; return; }

  try {
    await api(`/requests/${requestId}/full-address`, { method: 'PATCH', body: { street, streetNumber, complement } });
    await openMyRequest(requestId);
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

async function approveCompletion(requestId, providerName) {
  await api(`/requests/${requestId}/approve-completion`, { method: 'POST' });
  rateServiceRequestId = requestId;
  selectedServiceRating = 0;
  document.getElementById('rate-service-provider-name').textContent = providerName ? `Avalie o serviço de ${providerName}` : 'Avalie o serviço prestado';
  document.getElementById('rate-service-comment').value = '';
  document.getElementById('rate-service-error').textContent = '';
  renderServiceStars();
  showScreen('rate-service');
}

function renderServiceStars() {
  document.querySelectorAll('#rate-service-stars .star-opt').forEach((el) => {
    const v = parseInt(el.dataset.value, 10);
    el.textContent = v <= selectedServiceRating ? '★' : '☆';
    el.classList.toggle('selected', v <= selectedServiceRating);
  });
}

function setServiceRating(n) {
  selectedServiceRating = n;
  renderServiceStars();
}

async function submitServiceRating() {
  const errorEl = document.getElementById('rate-service-error');
  errorEl.textContent = '';
  if (!selectedServiceRating) {
    errorEl.textContent = 'Escolha uma nota de 1 a 5 estrelas';
    return;
  }
  try {
    await api(`/requests/${rateServiceRequestId}/review`, {
      method: 'POST',
      body: { rating: selectedServiceRating, comment: document.getElementById('rate-service-comment').value.trim() },
    });
    setTab('my-requests');
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

function openChatFromConfirm() {
  if (!lastPaymentContext) return;
  openChatThread(lastPaymentContext.requestId, lastPaymentContext.otherId, lastPaymentContext.otherName || 'Chat');
}

// ---------- Prestador: pedidos abertos ----------
// Mostra origem/destino/detalhes nas categorias de frete, mudança, guincho e
// viagem — com link direto pro Google Maps calcular a distância aproximada
// (sem precisar de chave de API paga, só abre a rota já preenchida).
function tripInfoHTML(r) {
  if (!r.trip_origin && !r.trip_destination && !r.trip_details) return '';
  const mapsUrl = (r.trip_origin && r.trip_destination)
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(r.trip_origin)}&destination=${encodeURIComponent(r.trip_destination)}`
    : null;
  return `
    <div style="font-size:12.5px;color:var(--ink-soft);margin-top:6px;padding-top:6px;border-top:1px dashed var(--line);">
      ${r.trip_origin ? `<div>📍 <strong>Origem:</strong> ${r.trip_origin}</div>` : ''}
      ${r.trip_destination ? `<div>🏁 <strong>Destino:</strong> ${r.trip_destination}</div>` : ''}
      ${r.trip_details ? `<div><strong>Detalhes:</strong> ${r.trip_details}</div>` : ''}
      ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" onclick="event.stopPropagation();" style="color:var(--primary-dark);font-weight:600;">Ver rota e distância no Google Maps</a>` : ''}
    </div>
  `;
}

async function loadOpenRequests() {
  document.getElementById('provider-home-avatar').src = avatarSrc(user);
  document.getElementById('provider-home-name').textContent = `Olá, ${(user.name || '').split(' ')[0]}`;
  const [requests, unreadRequestIds] = await Promise.all([api('/requests/open'), getUnreadRequestIds()]);
  document.getElementById('open-requests-list').innerHTML = requests.length
    ? requests.map((r) => `
      <div class="req-card ${unreadRequestIds.has(r.id) ? 'has-new' : ''}" ${r.already_proposed ? '' : `onclick="openSubmitProposal('${r.id}','${r.service_name.replace(/'/g, "\\'")}','${r.category}','${r.client_id}','${(r.client_name || '').replace(/'/g, "\\'")}')"`}>
        <div class="row1"><span class="title">${unreadRequestIds.has(r.id) ? '<span class="new-dot"></span>' : ''}${r.service_name}</span>${r.already_proposed ? '<span class="pill pending">Proposta enviada</span>' : ''}</div>
        <div class="meta-row">${r.category} · Cliente: ${r.client_name} · ${dateFmt(r.created_at)}</div>
        ${r.description ? `<div style="font-size:12.5px;color:var(--ink-soft);">${r.description}</div>` : ''}
        ${tripInfoHTML(r)}
      </div>
    `).join('')
    : '<div class="empty-state"><span class="glyph">🗂️</span><p>Nenhum pedido disponível no momento.</p></div>';
  loadProviderHomeBanners();
  loadVerificationBanner();
  loadSubscriptionPromoBanner();
}

// Chama atenção pra assinatura na home do prestador — só mostra pra quem
// ainda não é assinante, não fica repetindo pra quem já assina.
async function loadSubscriptionPromoBanner() {
  const el = document.getElementById('subscription-promo-banner');
  if (!el) return;
  try {
    const status = await api('/provider/subscription/status');
    if (status.active) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="pro-promo-banner">
        <span class="icon">⭐</span>
        <div class="txt">
          <strong>Vire PRO e apareça primeiro</strong>
          <span>Destaque automático, prioridade nos orçamentos e aviso instantâneo de pedido novo no WhatsApp — por ${money(status.price)}/mês.</span>
          <button onclick="showScreen('provider-subscription'); loadSubscriptionStatus();">Conhecer o Plano PRO</button>
        </div>
      </div>
    `;
  } catch { el.innerHTML = ''; }
}

async function loadProviderHomeBanners() {
  const banners = await api(`/banner-ads/active?city=${encodeURIComponent(user.city || '')}`);
  const topBanners = banners.filter((b) => b.position === 'top');
  const bottom = banners.find((b) => b.position === 'bottom');
  renderTopBannerCarousel('provider-banner-top', topBanners);
  document.getElementById('provider-banner-bottom').innerHTML = bottom ? bannerHTML(bottom) : '';
}

// ---------- Verificação de identidade ----------
async function loadVerificationBanner() {
  const el = document.getElementById('verification-banner');
  const v = await api('/provider/verification');
  if (v.status === 'suspended' || v.status === 'rejected') {
    el.innerHTML = `
      <div class="verif-banner danger">
        <span class="icon">⛔</span>
        <div class="txt">
          <strong>Cadastro pausado</strong>
          <span>Nossa equipe pausou seu cadastro até você regularizar alguns dados. Fale com o suporte pela Central de ajuda.</span>
        </div>
      </div>
    `;
  } else if (!v.complete) {
    el.innerHTML = `
      <div class="verif-banner">
        <span class="icon">📋</span>
        <div class="txt">
          <strong>Complete sua verificação</strong>
          <span>Envie a foto do seu documento e uma selfie para poder aceitar pedidos.</span>
          <button onclick="showScreen('provider-verification')">Enviar agora</button>
        </div>
      </div>
    `;
  } else {
    el.innerHTML = '';
  }
}

function previewVerificationFile(type) {
  const input = document.getElementById(`verif-${type}`);
  const box = document.getElementById(`verif-${type}-box`);
  if (input.files[0]) {
    box.classList.add('filled');
    box.firstChild.textContent = `✓ ${input.files[0].name}`;
  }
}

// Foto direto da câmera do celular costuma vir com vários MB — em conexão
// fraca (4G/3G instável) isso faz o upload cair no meio do caminho ("Failed
// to fetch") antes de terminar. Reduz pra um tamanho máximo razoável e
// reencoda em JPEG antes de enviar, sem perda visível de qualidade pra fins
// de conferência de documento.
function compressImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/') || file.type === 'image/gif') {
      resolve(file);
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob || blob.size >= file.size) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

async function submitVerification() {
  const errorEl = document.getElementById('verif-error');
  const btn = document.getElementById('verif-submit-btn');
  errorEl.textContent = '';
  let documentFile = document.getElementById('verif-document').files[0];
  let selfieFile = document.getElementById('verif-selfie').files[0];
  let diplomaFile = document.getElementById('verif-diploma').files[0];
  let criminalRecordFile = document.getElementById('verif-criminalRecord').files[0];

  const existing = await api('/provider/verification');
  if (!documentFile && !existing.documentPhotoUrl) { errorEl.textContent = 'Envie a foto do documento.'; return; }
  if (!selfieFile && !existing.selfiePhotoUrl) { errorEl.textContent = 'Envie a selfie.'; return; }

  btn.disabled = true;
  const originalBtnText = btn.textContent;
  btn.textContent = 'Enviando...';
  try {
    [documentFile, selfieFile, diplomaFile, criminalRecordFile] = await Promise.all([
      compressImage(documentFile), compressImage(selfieFile), compressImage(diplomaFile), compressImage(criminalRecordFile),
    ]);

    const fd = new FormData();
    if (documentFile) fd.append('document', documentFile);
    if (selfieFile) fd.append('selfie', selfieFile);
    if (diplomaFile) fd.append('diploma', diplomaFile);
    if (criminalRecordFile) fd.append('criminalRecord', criminalRecordFile);

    await api('/provider/verification', { method: 'POST', body: fd });
    if (selfieFile) {
      const fresh = await api(`/providers/${user.id}`);
      user.photoUrl = fresh.photo_url;
      localStorage.setItem('chama_user', JSON.stringify(user));
    }
    setTab('provider-home');
  } catch (err) {
    errorEl.textContent = err.message === 'Failed to fetch'
      ? 'Falha de conexão ao enviar. Verifique sua internet e tente novamente.'
      : err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = originalBtnText;
  }
}

// ---------- Sacar ganhos ----------
const PIX_KEY_TYPES = [
  { value: 'CPF', label: 'CPF' }, { value: 'CNPJ', label: 'CNPJ' },
  { value: 'EMAIL', label: 'E-mail' }, { value: 'PHONE', label: 'Telefone' },
  { value: 'EVP', label: 'Chave aleatória' },
];
const BANK_CODES = [
  { code: '001', name: 'Banco do Brasil' }, { code: '003', name: 'Banco da Amazônia' }, { code: '004', name: 'Banco do Nordeste' },
  { code: '021', name: 'Banestes' }, { code: '025', name: 'Banco Alfa' }, { code: '033', name: 'Santander' },
  { code: '037', name: 'Banco do Estado do Pará' }, { code: '041', name: 'Banrisul' }, { code: '070', name: 'BRB - Banco de Brasília' },
  { code: '077', name: 'Inter' }, { code: '085', name: 'Ailos' }, { code: '091', name: 'Unicred' },
  { code: '102', name: 'XP Investimentos' }, { code: '104', name: 'Caixa Econômica Federal' }, { code: '107', name: 'Banco Bocom BBM' },
  { code: '121', name: 'Banco Agibank' }, { code: '197', name: 'Stone' }, { code: '208', name: 'Banco BTG Pactual' },
  { code: '212', name: 'Banco Original' }, { code: '218', name: 'Banco BS2' }, { code: '237', name: 'Bradesco' },
  { code: '260', name: 'Nubank' }, { code: '290', name: 'PagBank' }, { code: '318', name: 'Banco BMG' },
  { code: '323', name: 'Mercado Pago' }, { code: '336', name: 'C6 Bank' }, { code: '341', name: 'Itaú' },
  { code: '380', name: 'PicPay' }, { code: '389', name: 'Banco Mercantil do Brasil' }, { code: '403', name: 'Cora' },
  { code: '422', name: 'Banco Safra' }, { code: '477', name: 'Citibank' }, { code: '600', name: 'Banco Luso Brasileiro' },
  { code: '611', name: 'Banco Paulista' }, { code: '623', name: 'Banco Pan' }, { code: '633', name: 'Banco Rendimento' },
  { code: '637', name: 'Banco Sofisa' }, { code: '655', name: 'Banco Votorantim (BV)' }, { code: '707', name: 'Banco Daycoval' },
  { code: '735', name: 'Banco Neon' }, { code: '743', name: 'Banco Semear' }, { code: '746', name: 'Banco Modal' },
  { code: '748', name: 'Sicredi' }, { code: '756', name: 'Sicoob' },
];

let editingBankAccount = false;

function editBankAccount() {
  editingBankAccount = true;
  loadWithdrawScreen();
}

function cancelEditBankAccount() {
  editingBankAccount = false;
  loadWithdrawScreen();
}

async function loadWithdrawScreen() {
  const [bankAccount, withdrawals] = await Promise.all([
    api('/provider/bank-account'),
    api('/provider/withdrawals'),
  ]);

  document.getElementById('withdraw-available').textContent = money(withdrawals.availableBalance);

  const bankSection = document.getElementById('bank-account-section');
  const formSection = document.getElementById('withdraw-form-section');

  if (bankAccount.registered && !editingBankAccount) {
    bankSection.innerHTML = `
      <div class="section-title"><h3>Conta bancária e Pix</h3></div>
      <div class="card">
        <strong style="font-size:14px;">${bankAccount.holderName}</strong>
        <p style="font-size:12.5px;color:var(--ink-soft);margin:4px 0 0;">
          ${(BANK_CODES.find((b) => b.code === bankAccount.bankCode) || {}).name || bankAccount.bankCode}
          · Ag. ${bankAccount.branch} · Conta ${bankAccount.accountNumber}-${bankAccount.accountDigit}
        </p>
        <p style="font-size:12.5px;color:var(--ink-soft);margin:4px 0 0;">
          Pix: ${(PIX_KEY_TYPES.find((t) => t.value === bankAccount.pixKeyType) || {}).label || bankAccount.pixKeyType} · ${bankAccount.pixKey}
        </p>
        <button class="btn btn-ghost btn-small" style="margin-top:10px;" onclick="editBankAccount()">Editar dados</button>
      </div>
    `;
    formSection.style.display = 'block';
    const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    formSection.innerHTML = `
      <div class="section-title"><h3>Solicitar saque de saldo</h3></div>
      <div class="fee-note">
        <span>ℹ️</span>
        <span>Use isso só se sobrar algum saldo que não foi pago automaticamente. Saque mínimo de ${money(withdrawals.minWithdrawal)}. Taxa de transferência: ${money(withdrawals.fee)}. Sujeito à aprovação da administração — saques aprovados são pagos toda ${dayNames[withdrawals.payoutDay]}.</span>
      </div>
      <div class="field"><label>Valor a sacar (R$)</label><input type="number" id="withdraw-amount" min="${withdrawals.minWithdrawal}" step="0.01"></div>
      <button class="btn btn-primary btn-block" onclick="requestWithdrawal()">Solicitar saque</button>
      <div class="error-msg" id="withdraw-error"></div>
    `;
  } else {
    formSection.style.display = 'none';
    const prefill = editingBankAccount ? bankAccount : {};
    const selectedBank = BANK_CODES.find((b) => b.code === prefill.bankCode);
    bankSection.innerHTML = `
      <div class="section-title"><h3>${editingBankAccount ? 'Editar dados bancários e chave Pix' : 'Cadastre sua conta bancária e chave Pix'}</h3></div>
      <p style="font-size:12px;color:var(--ink-soft);margin:0 0 12px;">Precisa ser feito uma vez, antes do primeiro saque.</p>
      <div class="field"><label>Nome completo do titular</label><input id="bank-holder-name" value="${prefill.holderName || user.name || ''}"></div>
      <div class="field">
        <label>CPF ou CNPJ do titular</label>
        <input id="bank-holder-document" value="${prefill.holderDocument || user.document || ''}" readonly style="background:var(--bg);color:var(--ink-soft);">
        <p style="font-size:11.5px;color:var(--ink-faint);margin:4px 0 0;">A conta e a chave Pix precisam estar no mesmo CPF/CNPJ do seu cadastro — não é possível sacar pra um documento diferente.</p>
      </div>
      <div class="field" style="position:relative;">
        <label>Banco</label>
        <input type="text" id="bank-search" placeholder="Digite o nome ou código do banco" autocomplete="off"
          value="${selectedBank ? `${selectedBank.code} — ${selectedBank.name}` : ''}"
          oninput="renderBankOptions(this.value)" onfocus="renderBankOptions(this.value)"
          onblur="setTimeout(() => { document.getElementById('bank-options-list').style.display = 'none'; }, 150)">
        <input type="hidden" id="bank-code" value="${prefill.bankCode || ''}">
        <div id="bank-options-list" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:20;background:var(--card-bg,#fff);border:1px solid var(--border);border-radius:8px;margin-top:4px;max-height:200px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.1);"></div>
      </div>
      <div style="display:flex;gap:10px;">
        <div class="field" style="flex:1;"><label>Agência</label><input id="bank-branch" placeholder="0000" value="${prefill.branch || ''}"></div>
        <div class="field" style="flex:1;"><label>Conta</label><input id="bank-account-number" placeholder="00000" value="${prefill.accountNumber || ''}"></div>
        <div class="field" style="width:70px;"><label>Dígito</label><input id="bank-account-digit" placeholder="0" value="${prefill.accountDigit || ''}"></div>
      </div>
      <div class="field">
        <label>Tipo de conta</label>
        <select id="bank-account-type">
          <option value="checking" ${prefill.accountType === 'checking' ? 'selected' : ''}>Corrente</option>
          <option value="savings" ${prefill.accountType === 'savings' ? 'selected' : ''}>Poupança</option>
        </select>
      </div>
      <div class="field">
        <label>Tipo de chave Pix</label>
        <select id="pix-key-type">${PIX_KEY_TYPES.map((t) => `<option value="${t.value}" ${prefill.pixKeyType === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Chave Pix</label><input id="pix-key" placeholder="CPF, e-mail, telefone ou chave aleatória" value="${prefill.pixKey || ''}"></div>

      <button class="btn btn-primary btn-block" onclick="saveBankAccount()">Salvar dados bancários</button>
      ${editingBankAccount ? `<button class="btn btn-ghost btn-block" style="margin-top:10px;" onclick="cancelEditBankAccount()">Cancelar</button>` : ''}
      <div class="error-msg" id="bank-account-error"></div>
    `;
  }

  document.getElementById('withdrawals-history').innerHTML = withdrawals.history.length
    ? withdrawals.history.map((w) => `
      <div class="req-card" style="cursor:default;">
        <div class="row1"><span class="title">${money(w.amount)}</span>${withdrawalStatusPillHTML(w.status)}</div>
        <div class="meta-row">${dateFmt(w.requested_at)}${w.fee > 0 ? ' · taxa ' + money(w.fee) : ''}</div>
        ${w.status === 'failed' && w.admin_notes ? `<div style="font-size:11.5px;color:var(--danger);margin-top:4px;">${w.admin_notes}</div>` : ''}
        ${w.status === 'processing' ? `<div style="font-size:11.5px;color:var(--ink-faint);margin-top:4px;">Transferência a caminho — pode levar algumas horas até confirmar.</div>` : ''}
      </div>
    `).join('')
    : '<div class="empty-state"><span class="glyph">💸</span><p>Nenhum saque solicitado ainda.</p></div>';
}

function withdrawalStatusPillHTML(status) {
  const labels = { pending: 'Aguardando aprovação', approved: 'Aprovado', processing: 'Transferência em análise', paid: 'Pago', rejected: 'Rejeitado', failed: 'Falhou' };
  const classes = { pending: 'pending', approved: 'accepted', processing: 'accepted', paid: 'done', rejected: 'rejected', failed: 'rejected' };
  return `<span class="pill ${classes[status] || 'pending'}">${labels[status] || status}</span>`;
}

function renderBankOptions(filterText) {
  const list = document.getElementById('bank-options-list');
  if (!list) return;
  const q = (filterText || '').toLowerCase().trim();
  const matches = BANK_CODES.filter((b) => b.name.toLowerCase().includes(q) || b.code.includes(q));
  list.innerHTML = matches.length
    ? matches.map((b) => `
        <div style="padding:9px 12px;cursor:pointer;font-size:13px;" onmousedown="selectBank('${b.code}')">
          <span class="mono" style="color:var(--ink-faint);">${b.code}</span> — ${b.name}
        </div>
      `).join('')
    : '<div style="padding:9px 12px;font-size:13px;color:var(--ink-faint);">Nenhum banco encontrado</div>';
  list.style.display = 'block';
}

function selectBank(code) {
  const bank = BANK_CODES.find((b) => b.code === code);
  document.getElementById('bank-code').value = code;
  document.getElementById('bank-search').value = bank ? `${bank.code} — ${bank.name}` : code;
  document.getElementById('bank-options-list').style.display = 'none';
}

async function saveBankAccount() {
  const errorEl = document.getElementById('bank-account-error');
  errorEl.textContent = '';
  const body = {
    holderName: document.getElementById('bank-holder-name').value.trim(),
    holderDocument: document.getElementById('bank-holder-document').value.trim(),
    bankCode: document.getElementById('bank-code').value,
    branch: document.getElementById('bank-branch').value.trim(),
    accountNumber: document.getElementById('bank-account-number').value.trim(),
    accountDigit: document.getElementById('bank-account-digit').value.trim(),
    accountType: document.getElementById('bank-account-type').value,
    pixKey: document.getElementById('pix-key').value.trim(),
    pixKeyType: document.getElementById('pix-key-type').value,
  };
  if (!body.holderName || !body.holderDocument || !body.pixKey || !body.pixKeyType) {
    errorEl.textContent = 'Preencha o titular, documento e a chave Pix.';
    return;
  }
  if (!body.bankCode || !body.branch || !body.accountNumber || !body.accountDigit) {
    errorEl.textContent = 'Preencha todos os dados bancários (selecione o banco na busca).';
    return;
  }
  try {
    await api('/provider/bank-account', { method: 'POST', body });
    editingBankAccount = false;
    loadWithdrawScreen();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

async function requestWithdrawal() {
  const errorEl = document.getElementById('withdraw-error');
  errorEl.textContent = '';
  const amount = parseFloat(document.getElementById('withdraw-amount').value);
  if (!amount || amount <= 0) { errorEl.textContent = 'Informe um valor válido.'; return; }
  try {
    await api('/provider/withdrawals', { method: 'POST', body: { amount } });
    loadWithdrawScreen();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

let editingProposalId = null;

function formatMoneyInput(el) {
  const digits = el.value.replace(/\D/g, '');
  if (!digits) { el.value = ''; return; }
  const reais = (parseInt(digits, 10) / 100).toFixed(2);
  const [intPart, decPart] = reais.split('.');
  el.value = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + decPart;
}

function parseMoneyInput(value) {
  if (!value) return NaN;
  return parseFloat(value.replace(/\./g, '').replace(',', '.'));
}

function setMoneyInputValue(el, numberValue) {
  el.value = String(Math.round(numberValue * 100));
  formatMoneyInput(el);
}

// Atalhos de disponibilidade — preenchem o datetime-local com um horário
// padrão (9h) pra quem não quer pensar em data exata, mas o campo continua
// livre pra ajustar depois (não troca a lógica, só poupa clique).
function setProposalAvailabilityQuick(preset, chipEl) {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  if (preset === 'tomorrow') d.setDate(d.getDate() + 1);
  else if (preset === 'week') d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 5)); // próxima sexta
  else if (preset === 'nextweek') d.setDate(d.getDate() + 7);
  // "today": se já passou das 9h, empurra pra daqui a 2h em vez de horário passado
  if (preset === 'today' && d < new Date()) {
    d.setTime(Date.now() + 2 * 60 * 60 * 1000);
  }
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('proposal-availability').value = local;
  document.querySelectorAll('#proposal-availability-chips .chip-opt').forEach((el) => el.classList.remove('selected'));
  if (chipEl) chipEl.classList.add('selected');
}

function openSubmitProposal(requestId, serviceName, category, clientId, clientName) {
  editingProposalId = null;
  currentChat = { requestId, otherId: clientId, otherName: clientName };
  document.getElementById('submit-proposal-title').textContent = 'Enviar proposta';
  document.getElementById('submit-proposal-btn').textContent = 'Enviar proposta';
  document.getElementById('submit-proposal-summary').innerHTML = `<div class="row1"><span class="title">${serviceName}</span></div><div class="meta-row">${category}</div>`;
  document.getElementById('proposal-value').value = '';
  document.getElementById('proposal-notes').value = '';
  const availabilityInput = document.getElementById('proposal-availability');
  availabilityInput.value = '';
  availabilityInput.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.querySelectorAll('#proposal-availability-chips .chip-opt').forEach((el) => el.classList.remove('selected'));
  document.getElementById('submit-proposal-error').textContent = '';
  document.getElementById('proposal-ask-question-btn').style.display = clientId ? 'block' : 'none';
  showScreen('submit-proposal');
  markRequestNotificationsRead(requestId);
}

function openEditProposal(proposalId, requestId, serviceName, category, currentValue, currentNotes, clientId, clientName) {
  editingProposalId = proposalId;
  currentChat = { requestId, otherId: clientId, otherName: clientName };
  document.getElementById('submit-proposal-title').textContent = 'Editar proposta';
  document.getElementById('submit-proposal-btn').textContent = 'Salvar e reenviar ao cliente';
  document.getElementById('submit-proposal-summary').innerHTML = `<div class="row1"><span class="title">${serviceName}</span></div><div class="meta-row">${category}</div>`;
  setMoneyInputValue(document.getElementById('proposal-value'), Number(currentValue));
  document.getElementById('proposal-notes').value = currentNotes || '';
  const availabilityInput = document.getElementById('proposal-availability');
  availabilityInput.value = '';
  availabilityInput.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.querySelectorAll('#proposal-availability-chips .chip-opt').forEach((el) => el.classList.remove('selected'));
  document.getElementById('submit-proposal-error').textContent = '';
  document.getElementById('proposal-ask-question-btn').style.display = clientId ? 'block' : 'none';
  showScreen('submit-proposal');
}

// Botão "Tirar dúvida com o cliente" dentro da tela de orçamento — abre o
// chat da própria thread (pedido + este prestador) sem sair do fluxo de
// proposta, pra ele perguntar algo (ex: "é com material ou só instalação?")
// antes de decidir o valor.
function askClientQuestionFromProposal() {
  if (!currentChat || !currentChat.otherId || currentChat.otherId === 'undefined') {
    alert('Não foi possível abrir o chat com o cliente. Feche e abra o app de novo e tente outra vez.');
    return;
  }
  openChatThread(currentChat.requestId, currentChat.otherId, currentChat.otherName).catch((err) => {
    alert('Erro ao abrir o chat: ' + err.message);
  });
}

const WEEKDAY_ABBR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function formatAvailability(datetimeLocalValue) {
  if (!datetimeLocalValue) return '';
  const d = new Date(datetimeLocalValue);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${WEEKDAY_ABBR[d.getDay()]}, ${dd}/${mm} às ${hh}:${min}`;
}

async function submitProposal() {
  const errorEl = document.getElementById('submit-proposal-error');
  errorEl.textContent = '';
  const value = parseMoneyInput(document.getElementById('proposal-value').value);
  const availabilityRaw = document.getElementById('proposal-availability').value;
  const notes = document.getElementById('proposal-notes').value.trim();
  if (!value || value <= 0) { errorEl.textContent = 'Informe um valor válido.'; return; }
  if (value < MIN_SERVICE_VALUE) { errorEl.textContent = `O valor mínimo de proposta é R$ ${MIN_SERVICE_VALUE}.`; return; }
  if (!availabilityRaw) { errorEl.textContent = 'Selecione o dia e horário de disponibilidade.'; return; }
  const availability = formatAvailability(availabilityRaw);
  try {
    if (editingProposalId) {
      await api(`/requests/${currentChat.requestId}/proposals/${editingProposalId}`, { method: 'PATCH', body: { value, availability, notes } });
    } else {
      await api(`/requests/${currentChat.requestId}/proposals`, { method: 'POST', body: { value, availability, notes } });
    }
    jobsTab = 'proposals';
    setTab('provider-jobs');
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

// ---------- Prestador: trabalhos / propostas ----------
function setJobsTab(tab) {
  jobsTab = tab;
  loadProviderJobs();
}

async function loadProviderJobs() {
  document.getElementById('jobs-tab-active').classList.toggle('active', jobsTab === 'active');
  document.getElementById('jobs-tab-proposals').classList.toggle('active', jobsTab === 'proposals');
  const el = document.getElementById('provider-jobs-list');
  if (jobsTab === 'active') {
    const [requests, unreadRequestIds] = await Promise.all([api('/requests/mine'), getUnreadRequestIds()]);
    el.innerHTML = requests.length ? requests.map((r) => `
      <div class="req-card ${unreadRequestIds.has(r.id) ? 'has-new' : ''}" onclick="openMyRequest('${r.id}')">
        <div class="row1"><span class="title">${unreadRequestIds.has(r.id) ? '<span class="new-dot"></span>' : ''}${r.service_name}</span>${statusPillHTML(r.status)}</div>
        <div class="meta-row">Cliente: ${r.client_name} · ${dateFmt(r.created_at)} · ${money(r.value)}</div>
        ${tripInfoHTML(r)}
        ${['accepted', 'in_progress'].includes(r.status) ? `<button class="btn btn-primary btn-small" onclick="event.stopPropagation();deliverRequest('${r.id}')">Marcar como entregue</button>` : ''}
      </div>
    `).join('') : '<div class="empty-state"><span class="glyph">🧰</span><p>Nenhum trabalho aceito ainda.</p></div>';
  } else {
    const [proposals, subStatus] = await Promise.all([
      api('/proposals/mine'),
      api('/provider/subscription/status').catch(() => ({ active: false })),
    ]);
    el.innerHTML = proposals.length ? proposals.map((p) => `
      <div class="req-card" style="cursor:default;">
        <div class="row1"><span class="title">${p.service_name}</span>${statusPillHTML(p.status)}</div>
        <div class="meta-row">${p.category} · ${money(p.value)} · ${dateFmt(p.created_at)}</div>
        ${p.notes ? `<div style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">${p.notes}</div>` : ''}
        ${p.status === 'pending' ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
            <button class="btn btn-ghost btn-small" onclick="event.stopPropagation();openEditProposal('${p.id}','${p.request_id}','${p.service_name.replace(/'/g, "\\'")}','${p.category}',${p.value},'${(p.notes || '').replace(/'/g, "\\'").replace(/\n/g, ' ')}','${p.client_id}','${(p.client_name || '').replace(/'/g, "\\'")}')">Editar valor</button>
            ${p.featured
              ? '<span class="badge-featured">⭐ Proposta em destaque</span>'
              : `<button class="btn btn-ghost btn-small" onclick="event.stopPropagation();featureProposal('${p.id}')">Destacar por ${PROPOSAL_FEATURE_COST} moedas</button>`}
            ${remindClientButtonHTML(p, subStatus.active)}
          </div>
          <div id="chat-unlock-${p.request_id}" style="margin-top:8px;"></div>` : ''}
      </div>
    `).join('') : '<div class="empty-state"><span class="glyph">📨</span><p>Você ainda não enviou nenhuma proposta.</p></div>';
    proposals.filter((p) => p.status === 'pending').forEach((p) => {
      loadChatUnlockCard(p.request_id, p.client_id, (p.client_name || '').replace(/'/g, "\\'"));
    });
  }
}

const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Assinante Plano PRO cobra a decisão do cliente com 1 clique, direto pelo
// número oficial da NEXSERV — trava 24h depois de cada envio (mesma regra
// do backend, checada de novo lá, isso aqui é só pra já mostrar certo).
function remindClientButtonHTML(p, isSubscriber) {
  if (!isSubscriber) return '';
  const onCooldown = p.reminder_sent_at && (Date.now() - new Date(p.reminder_sent_at).getTime()) < REMINDER_COOLDOWN_MS;
  if (onCooldown) return '<span id="remind-status-' + p.id + '" style="font-size:11.5px;color:var(--ink-faint);align-self:center;">Decisão cobrada hoje</span>';
  return `<button class="btn btn-ghost btn-small" id="remind-btn-${p.id}" onclick="event.stopPropagation();remindClientDecision('${p.id}')">📣 Cobrar decisão</button>`;
}

async function remindClientDecision(proposalId) {
  const btn = document.getElementById(`remind-btn-${proposalId}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  try {
    await api(`/proposals/${proposalId}/remind-client`, { method: 'POST' });
    if (btn) btn.outerHTML = `<span style="font-size:11.5px;color:var(--ink-faint);align-self:center;">Decisão cobrada hoje</span>`;
  } catch (err) {
    alert(err.message);
    if (btn) { btn.disabled = false; btn.textContent = '📣 Cobrar decisão'; }
  }
}

// Chat trava assim que a proposta é enviada (antes disso ficava livre pra
// tirar dúvida — ver botão na tela de orçamento). Assinante Plano PRO abre
// direto; quem não assina paga com moedas pra liberar aquele pedido
// específico. Mesmo padrão visual do desbloqueio de contato pós-pagamento.
async function loadChatUnlockCard(requestId, clientId, clientName) {
  const slot = document.getElementById(`chat-unlock-${requestId}`);
  if (!slot) return;
  try {
    const data = await api(`/provider/chat-unlock/${requestId}`);
    if (data.unlocked) {
      slot.innerHTML = `<button class="btn btn-ghost btn-small" onclick="event.stopPropagation();openChatThread('${requestId}','${clientId}','${clientName}')">💬 Abrir chat</button>`;
    } else {
      slot.innerHTML = `
        <div class="card" style="margin-top:4px;">
          <p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 8px;">Chat travado após o envio da proposta. Assine o Plano PRO ou libere só este pedido por ${data.coinUnlockCost} moedas.</p>
          <div class="error-msg" id="chat-unlock-error-${requestId}"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-primary btn-small" onclick="event.stopPropagation();unlockChatWithCoins('${requestId}','${clientId}','${clientName}')">Liberar por ${data.coinUnlockCost} moedas</button>
            <button class="btn btn-ghost btn-small" onclick="event.stopPropagation();showScreen('provider-subscription'); loadSubscriptionStatus();">Conhecer o Plano PRO</button>
          </div>
        </div>
      `;
    }
  } catch { slot.innerHTML = ''; }
}

async function unlockChatWithCoins(requestId, clientId, clientName) {
  const errorEl = document.getElementById(`chat-unlock-error-${requestId}`);
  try {
    await api(`/provider/chat-unlock/${requestId}`, { method: 'POST' });
    await loadChatUnlockCard(requestId, clientId, clientName);
  } catch (err) {
    if (errorEl) errorEl.textContent = err.message;
  }
}

async function deliverRequest(requestId) {
  await api(`/requests/${requestId}/deliver`, { method: 'POST' });
  loadProviderJobs();
}

const PROPOSAL_FEATURE_COST = 100;

async function featureProposal(proposalId) {
  try {
    await api(`/proposals/${proposalId}/feature`, { method: 'POST' });
    loadProviderJobs();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- Ganhos / Carteira ----------
let earningsTab = 'summary';
let drePeriod = 'day';
const EXPENSE_CATEGORY_LABELS = { material: 'Material', transporte: 'Transporte', ferramentas: 'Ferramentas', marketing: 'Marketing', outros: 'Outros' };

function setEarningsTab(tab) {
  earningsTab = tab;
  document.getElementById('earnings-tab-summary').classList.toggle('active', tab === 'summary');
  document.getElementById('earnings-tab-dre').classList.toggle('active', tab === 'dre');
  document.getElementById('earnings-tab-wallet').classList.toggle('active', tab === 'wallet');
  document.getElementById('earnings-summary-pane').style.display = tab === 'summary' ? 'block' : 'none';
  document.getElementById('dre-pane').style.display = tab === 'dre' ? 'block' : 'none';
  document.getElementById('wallet-pane').style.display = tab === 'wallet' ? 'block' : 'none';
  if (tab === 'summary') loadEarnings();
  else if (tab === 'dre') loadDre();
  else loadWallet();
}

function setDrePeriod(period) {
  drePeriod = period;
  document.getElementById('dre-tab-day').classList.toggle('active', period === 'day');
  document.getElementById('dre-tab-week').classList.toggle('active', period === 'week');
  document.getElementById('dre-tab-month').classList.toggle('active', period === 'month');
  document.getElementById('dre-tab-year').classList.toggle('active', period === 'year');
  loadDre();
}

async function loadEarningsScreen() {
  document.getElementById('expense-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('earnings-avatar').src = avatarSrc(user);
  document.getElementById('earnings-provider-name').textContent = user.name;

  const p = await api(`/providers/${user.id}`);
  document.getElementById('earnings-provider-role').textContent = (p.categories || [])[0] || 'Prestador de serviços';
  document.getElementById('earnings-level').textContent = p.level || 'Bronze';

  const stats = await api('/provider/dashboard-stats');
  const miniItems = [
    { n: stats.servicesCompleted.count, l: 'Concluídos' },
    { n: p.rating_avg ? parseFloat(p.rating_avg).toFixed(1) : '—', l: 'Nota média' },
    { n: stats.proposalsSent.count, l: 'Propostas (7d)' },
    { n: stats.profileViews.count, l: 'Visitas (7d)' },
  ];
  document.getElementById('earnings-mini-stats').innerHTML = miniItems.map((m) => `<div class="m"><div class="n">${m.n}</div><div class="l">${m.l}</div></div>`).join('');

  const dashboardStatsItems = [
    { key: 'profileViews', label: 'Visitas ao perfil', icon: '👀', bg: 'var(--info-tint)', fg: 'var(--info)' },
    { key: 'proposalsSent', label: 'Propostas enviadas', icon: '📨', bg: 'var(--purple-tint)', fg: 'var(--purple)' },
    { key: 'servicesCompleted', label: 'Serviços concluídos', icon: '✅', bg: 'var(--success-tint)', fg: 'var(--success)' },
    { key: 'contactsUnlocked', label: 'Contatos desbloqueados', icon: '🔓', bg: 'var(--warning-tint)', fg: 'var(--warning)' },
  ];
  document.getElementById('provider-dashboard-stats').innerHTML = dashboardStatsItems.map((it) => {
    const s = stats[it.key];
    const deltaClass = s.delta > 0 ? 'up' : (s.delta < 0 ? 'down' : '');
    const deltaSign = s.delta > 0 ? '+' : '';
    return `
      <div class="stat-box">
        <div class="icon" style="background:${it.bg};color:${it.fg};margin:0 auto 8px;">${it.icon}</div>
        <div class="num">${s.count}</div>
        <div class="lab">${it.label}</div>
        <div class="delta ${deltaClass}">${deltaSign}${s.delta}%</div>
      </div>
    `;
  }).join('');

  if (earningsTab === 'summary') await loadEarnings();
  else if (earningsTab === 'dre') await loadDre();
  else await loadWallet();
}

async function loadEarnings() {
  const data = await api('/provider/earnings');
  document.getElementById('earnings-released').textContent = money(data.releasedTotal);
  document.getElementById('earnings-held').textContent = money(data.heldTotal);
  document.getElementById('earnings-list').innerHTML = data.transactions.length
    ? data.transactions.map((t) => `
      <div class="req-card" style="cursor:default;">
        <div class="row1"><span class="title">${t.service_name}</span><span class="pill ${t.released_at ? 'done' : 'pending'}">${t.released_at ? 'Liberado' : 'Retido'}</span></div>
        <div class="meta-row">${t.client_name} · ${money(t.net_value)}</div>
      </div>
    `).join('') : '<div class="empty-state"><span class="glyph">💰</span><p>Nenhum ganho ainda.</p></div>';
}

async function loadDre() {
  const upsellEl = document.getElementById('dre-upsell');
  const contentEl = document.getElementById('dre-content');
  let data;
  try {
    data = await api(`/provider/dre?period=${drePeriod}`);
  } catch (err) {
    contentEl.style.display = 'none';
    upsellEl.style.display = 'block';
    upsellEl.innerHTML = `
      <div class="card" style="text-align:center;padding:24px 16px;">
        <div style="font-size:32px;">⭐</div>
        <strong style="font-size:15px;">Controle financeiro completo é do Plano PRO</strong>
        <p style="font-size:13px;color:var(--ink-soft);margin:8px 0 16px;">Acompanhe receita, despesas por categoria e resultado por dia, semana, mês ou ano. Assine o Plano PRO para liberar.</p>
        <button class="btn btn-primary btn-block btn-small" onclick="showScreen('provider-subscription'); loadSubscriptionStatus();">Conhecer o Plano PRO</button>
      </div>
    `;
    return;
  }
  upsellEl.style.display = 'none';
  contentEl.style.display = 'block';

  document.getElementById('dre-revenue').textContent = money(data.revenueTotal);
  document.getElementById('dre-expenses').textContent = money(data.expensesTotal);
  const resultEl = document.getElementById('dre-result');
  resultEl.textContent = money(data.result);
  resultEl.style.color = data.result < 0 ? 'var(--danger)' : 'var(--success)';

  document.getElementById('dre-category-breakdown').innerHTML = data.expensesByCategory.length
    ? data.expensesByCategory.map((c) => `
      <div class="req-card" style="cursor:default;">
        <div class="row1"><span class="title">${EXPENSE_CATEGORY_LABELS[c.category] || c.category}</span><span style="font-weight:700;color:var(--danger);">${money(c.total)}</span></div>
      </div>
    `).join('') : '<div class="empty-state" style="padding:16px;"><p>Nenhuma despesa lançada no período.</p></div>';

  document.getElementById('dre-revenue-list').innerHTML = data.revenue.length
    ? data.revenue.map((t) => `
      <div class="req-card" style="cursor:default;">
        <div class="row1"><span class="title">${t.service_name}</span><span style="font-weight:700;color:var(--success);">+ ${money(t.net_value)}</span></div>
        <div class="meta-row">${t.client_name} · ${dateFmt(t.released_at)}</div>
      </div>
    `).join('') : '<div class="empty-state" style="padding:16px;"><p>Nenhuma receita liberada no período.</p></div>';

  document.getElementById('dre-expenses-list').innerHTML = data.expenses.length
    ? data.expenses.map((e) => `
      <div class="req-card" style="cursor:default;">
        <div class="row1"><span class="title">${e.description} <span style="font-size:11px;color:var(--ink-soft);font-weight:400;">(${EXPENSE_CATEGORY_LABELS[e.category] || e.category})</span></span><span style="font-weight:700;color:var(--danger);">- ${money(e.amount)}</span></div>
        <div class="meta-row">${dateFmt(e.expense_date)} <a onclick="deleteExpense('${e.id}')" style="color:var(--primary);cursor:pointer;margin-left:8px;font-weight:600;">excluir</a></div>
      </div>
    `).join('') : '<div class="empty-state" style="padding:16px;"><p>Nenhuma despesa lançada no período.</p></div>';
}

async function addExpense() {
  const errorEl = document.getElementById('expense-error');
  errorEl.textContent = '';
  const description = document.getElementById('expense-description').value.trim();
  const amount = parseFloat(document.getElementById('expense-amount').value);
  const expenseDate = document.getElementById('expense-date').value;
  const category = document.getElementById('expense-category').value;
  if (!description || !amount || amount <= 0) { errorEl.textContent = 'Informe descrição e valor válidos.'; return; }

  try {
    await api('/provider/expenses', { method: 'POST', body: { description, amount, expenseDate, category } });
    document.getElementById('expense-description').value = '';
    document.getElementById('expense-amount').value = '';
    await loadDre();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

async function deleteExpense(id) {
  await api(`/provider/expenses/${id}`, { method: 'DELETE' });
  await loadDre();
}

// ---------- Moedas / destaque ----------
let selectedCoinPackage = null;
let coinPayMethod = 'pix';

async function loadWallet() {
  const [balanceData, packages] = await Promise.all([
    api('/provider/coins/balance'),
    api('/provider/coins/packages'),
  ]);
  document.getElementById('coins-balance').textContent = balanceData.balance;
  document.getElementById('coin-packages').innerHTML = packages.map((p) => `
    <div class="req-card" onclick="selectCoinPackage('${p.id}')">
      <div class="row1"><span class="title">${p.coins} moedas</span><span class="price" style="font-size:15px;">${money(p.price)}</span></div>
    </div>
  `).join('');
  document.getElementById('coin-payment-form').style.display = 'none';
  selectedCoinPackage = null;
  await loadFeatureStatus();
}

async function loadFeatureStatus() {
  const status = await api('/provider/feature-status');
  const el = document.getElementById('feature-status-card');
  if (status.active) {
    el.innerHTML = `
      <div class="row1"><span class="title">★ Perfil em destaque</span></div>
      <p style="font-size:12.5px;color:var(--ink-soft);margin:4px 0 0;">Ativo até ${dateFmt(status.featuredUntil)}.</p>
      <button class="btn btn-ghost btn-block btn-small" style="margin-top:10px;" onclick="buyFeature()">Renovar por mais 30 dias (${status.cost} moedas)</button>
    `;
  } else {
    el.innerHTML = `
      <div class="row1"><span class="title">Fique em destaque por 30 dias</span></div>
      <p style="font-size:12.5px;color:var(--ink-soft);margin:4px 0 0;">Aparece primeiro pros clientes e ganha o selo "Destaque" nas suas propostas.</p>
      <button class="btn btn-primary btn-block btn-small" style="margin-top:10px;" onclick="buyFeature()">Destacar por ${status.cost} moedas</button>
    `;
  }
}

async function buyFeature() {
  try {
    await api('/provider/feature', { method: 'POST' });
    await loadWallet();
  } catch (err) {
    alert(err.message);
  }
}

function selectCoinPackage(packageId) {
  selectedCoinPackage = packageId;
  document.getElementById('coin-payment-form').style.display = 'block';
  document.getElementById('coin-purchase-error').textContent = '';
  document.getElementById('coin-qr-container').innerHTML = '';
}

function selectCoinPayMethod(el) {
  document.querySelectorAll('#coin-payment-form .pay-method').forEach((m) => m.classList.remove('selected'));
  el.classList.add('selected');
  coinPayMethod = el.dataset.method;
  document.getElementById('coin-card-fields').style.display = coinPayMethod === 'credit_card' ? 'block' : 'none';
}

async function confirmCoinPurchase() {
  const errorEl = document.getElementById('coin-purchase-error');
  errorEl.textContent = '';
  if (!selectedCoinPackage) return;

  const body = { packageId: selectedCoinPackage, paymentMethod: coinPayMethod };
  if (coinPayMethod === 'credit_card') {
    const [expMonth, expYear] = (document.getElementById('coin-card-expiry').value || '').split('/');
    body.card = {
      number: document.getElementById('coin-card-number').value.replace(/\s/g, ''),
      holderName: document.getElementById('coin-card-holder').value,
      expMonth: parseInt(expMonth, 10),
      expYear: parseInt(expYear, 10),
      cvv: document.getElementById('coin-card-cvv').value,
    };
    body.billingAddress = {
      line1: user.street || 'Não informado',
      zipCode: (document.getElementById('coin-card-zip').value || '').replace(/\D/g, ''),
      city: user.city || 'Não informado', state: user.state || 'SP',
    };
  }

  try {
    const result = await api('/provider/coins/purchase', { method: 'POST', body });
    if (result.qrCodeUrl) {
      document.getElementById('coin-qr-container').innerHTML = pixQrBoxHTML(result.qrCodeUrl, result.pixCopyPaste);
    } else {
      await loadWallet();
    }
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

// ---------- Plano PRO (assinatura) ----------
let subscriptionPayMethod = 'pix';

async function loadSubscriptionStatus() {
  document.getElementById('subscription-purchase-error').textContent = '';
  document.getElementById('subscription-qr-container').innerHTML = '';
  const status = await api('/provider/subscription/status');
  const el = document.getElementById('subscription-status-card');
  const btn = document.getElementById('subscription-confirm-btn');
  const statsSection = document.getElementById('subscription-stats-section');
  if (status.active) {
    el.innerHTML = `
      <div class="row1"><span class="title">⭐ Plano PRO ativo</span></div>
      <p style="font-size:12.5px;color:var(--ink-soft);margin:4px 0 0;">Válido até ${dateFmt(status.currentPeriodEnd)}. Pode renovar a qualquer momento — os dias que faltam não se perdem.</p>
    `;
    btn.textContent = `Renovar por mais 30 dias (${money(status.price)})`;
    loadSubscriptionStats();
  } else {
    el.innerHTML = `
      <div class="row1"><span class="title">Você ainda não é assinante</span></div>
      <p style="font-size:12.5px;color:var(--ink-soft);margin:4px 0 0;">Assine o Plano PRO e comece a receber os benefícios na hora.</p>
    `;
    btn.textContent = `Assinar por ${money(status.price)}/mês`;
    statsSection.innerHTML = '';
  }
}

async function loadSubscriptionStats() {
  const statsSection = document.getElementById('subscription-stats-section');
  try {
    const stats = await api('/provider/subscription/stats');
    statsSection.innerHTML = `
      <div class="section-title"><h3>Seu desempenho</h3></div>
      <div class="stat-grid cols-4">
        <div class="stat-box"><div class="num">${stats.profileViews30Days}</div><div class="lab">Visitas ao perfil (30d)</div></div>
        <div class="stat-box"><div class="num">${stats.profileViewsTotal}</div><div class="lab">Visitas ao perfil (total)</div></div>
        <div class="stat-box"><div class="num">${stats.proposalsSent}</div><div class="lab">Propostas enviadas</div></div>
        <div class="stat-box"><div class="num">${stats.conversionRate}%</div><div class="lab">Taxa de conversão</div></div>
      </div>
    `;
  } catch {
    statsSection.innerHTML = '';
  }
}

function selectSubscriptionPayMethod(el) {
  document.querySelectorAll('[data-screen="provider-subscription"] .pay-method').forEach((m) => m.classList.remove('selected'));
  el.classList.add('selected');
  subscriptionPayMethod = el.dataset.method;
  document.getElementById('subscription-card-fields').style.display = subscriptionPayMethod === 'credit_card' ? 'block' : 'none';
}

async function confirmSubscriptionPurchase() {
  const errorEl = document.getElementById('subscription-purchase-error');
  errorEl.textContent = '';

  const body = { paymentMethod: subscriptionPayMethod };
  if (subscriptionPayMethod === 'credit_card') {
    const [expMonth, expYear] = (document.getElementById('subscription-card-expiry').value || '').split('/');
    body.card = {
      number: document.getElementById('subscription-card-number').value.replace(/\s/g, ''),
      holderName: document.getElementById('subscription-card-holder').value,
      expMonth: parseInt(expMonth, 10),
      expYear: parseInt(expYear, 10),
      cvv: document.getElementById('subscription-card-cvv').value,
    };
    body.billingAddress = {
      line1: user.street || 'Não informado',
      zipCode: (document.getElementById('subscription-card-zip').value || '').replace(/\D/g, ''),
      city: user.city || 'Não informado', state: user.state || 'SP',
    };
  }

  try {
    const result = await api('/provider/subscription/subscribe', { method: 'POST', body });
    if (result.qrCodeUrl) {
      document.getElementById('subscription-qr-container').innerHTML = pixQrBoxHTML(result.qrCodeUrl, result.pixCopyPaste);
    } else {
      await loadSubscriptionStatus();
    }
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

// ---------- Mensagens ----------
function setMessagesTab(tab) {
  messagesTab = tab;
  document.getElementById('msg-tab-all').classList.toggle('active', tab === 'all');
  document.getElementById('msg-tab-unread').classList.toggle('active', tab === 'unread');
  document.getElementById('msg-tab-archived').classList.toggle('active', tab === 'archived');
  loadConversations();
}

async function loadConversations() {
  const archived = messagesTab === 'archived';
  let conversations = await api(`/conversations?archived=${archived}`);
  if (messagesTab === 'unread') conversations = conversations.filter((c) => parseInt(c.unread_count, 10) > 0);

  const query = normalize(document.getElementById('messages-search-input').value);
  if (query) conversations = conversations.filter((c) => normalize(c.other_name).includes(query) || normalize(c.service_name).includes(query));

  document.getElementById('conversations-list').innerHTML = conversations.length
    ? conversations.map((c) => `
      <div class="convo-card" onclick="openChatThread('${c.request_id}','${c.other_id}','${c.other_name.replace(/'/g, "\\'")}')">
        <div class="avatar">${avatarBoxHTML(c.other_name, c.other_photo_url)}</div>
        <div class="convo-text">
          <div class="top-row"><span class="cname">${c.other_name}</span><span class="ctime">${c.last_message_at ? timeFmt(c.last_message_at) : ''}</span></div>
          <div class="cpreview">${c.last_message || c.service_name}</div>
        </div>
        ${parseInt(c.unread_count, 10) > 0 ? `<span class="unread-badge">${c.unread_count}</span>` : ''}
      </div>
    `).join('') : '<div class="empty-state"><span class="glyph">💬</span><p>Nenhuma conversa por aqui.</p></div>';
}

// Cada conversa agora é uma thread (pedido + prestador específico) — um
// pedido pode ter várias em paralelo (um prestador diferente tirando dúvida
// antes de orçar cada um). Prestador sempre fala na própria thread (o
// backend ignora qualquer providerId enviado por ele e usa o próprio id);
// cliente precisa apontar com qual prestador está falando, que é sempre
// currentChat.otherId nessa tela.
function currentThreadProviderId() {
  if (!currentChat) return null;
  return user.role === 'provider' ? user.id : currentChat.otherId;
}

async function archiveCurrentChat() {
  if (!currentChat) return;
  const btn = document.getElementById('chat-archive-btn');
  const archiving = btn.textContent === 'Arquivar';
  await api(`/conversations/${currentChat.requestId}/archive`, { method: 'PATCH', body: { archived: archiving, providerId: currentThreadProviderId() } });
  btn.textContent = archiving ? 'Desarquivar' : 'Arquivar';
  setTab('messages');
}

async function openChatThread(requestId, otherId, otherName) {
  currentChat = { requestId, otherId, otherName };
  const providerId = currentThreadProviderId();
  document.getElementById('chat-name').textContent = otherName;
  document.getElementById('chat-avatar').innerHTML = initials(otherName);
  document.getElementById('chat-archive-btn').textContent = 'Arquivar';
  document.getElementById('chat-service-card').style.display = 'none';
  document.getElementById('chat-body').innerHTML = '<div class="empty-state"><span class="glyph">💬</span><p>Carregando conversa...</p></div>';
  document.getElementById('chat-no-contact-notice').style.display = user.role === 'provider' ? 'flex' : 'none';
  const remindBtn = document.getElementById('chat-remind-provider-btn');
  remindBtn.style.display = user.role === 'client' ? 'inline-block' : 'none';
  remindBtn.disabled = false;
  remindBtn.textContent = '🔔 Cutucar';
  renderedMessageIds = new Set();

  // Troca de tela na hora (sem esperar a rede) — antes ficava parado na tela
  // anterior até as duas chamadas terminarem, o que em conexão ruim parecia
  // que o botão não tinha feito nada.
  showScreen('chat-thread');

  const [requestResult, historyResult] = await Promise.allSettled([
    api(`/requests/${requestId}`),
    api(`/requests/${requestId}/messages?providerId=${providerId}`),
  ]);

  if (requestResult.status === 'fulfilled') {
    const r = requestResult.value;
    document.getElementById('chat-service-card').style.display = 'flex';
    document.getElementById('chat-service-card').innerHTML = `
      <div class="icon" style="background:var(--primary-tint);color:var(--primary-dark);">${categoryIcon[r.category] || '🛠️'}</div>
      <div class="txt"><strong>${r.service_name}</strong><div class="meta-line"><span class="pill ${r.status}">${statusLabels[r.status] || r.status}</span>${r.value ? money(r.value) : ''}</div></div>
    `;
    // Proposta aceita, ainda combinando dia/detalhes — lembra o cliente de
    // pagar pelo app (dinheiro só sai da custódia depois do serviço
    // concluído e aprovado), não combinar pagamento por fora com o prestador.
    document.getElementById('chat-payment-notice').style.display = (r.status === 'accepted' && user.role === 'client') ? 'flex' : 'none';
  } else {
    document.getElementById('chat-payment-notice').style.display = 'none';
  }

  const body = document.getElementById('chat-body');
  if (historyResult.status === 'fulfilled') {
    const history = historyResult.value;
    body.innerHTML = history.map(messageBubbleHTML).join('') || '<div class="empty-state"><span class="glyph">💬</span><p>Nenhuma mensagem ainda. Números de telefone, e-mail e CEP são removidos automaticamente — combine tudo pelo app até o pagamento.</p></div>';
    history.forEach((m) => renderedMessageIds.add(m.id));
    body.scrollTop = body.scrollHeight;
  } else {
    body.innerHTML = `<div class="empty-state"><span class="glyph">⚠️</span><p>${historyResult.reason?.message || 'Erro ao carregar a conversa.'}</p></div>`;
  }

  connectChatSocket(requestId, providerId);
}

// Cliente avisa o prestador (que está demorando pra responder no chat) pelo
// número oficial da NEXSERV, com 1 clique — trava 24h depois de cada envio
// (checado de novo no backend, isso aqui é só pra já refletir na tela).
async function remindProviderSlow() {
  if (!currentChat || !currentChat.otherId) return;
  const btn = document.getElementById('chat-remind-provider-btn');
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  try {
    await api(`/conversations/${currentChat.requestId}/remind-provider`, { method: 'POST', body: { providerId: currentChat.otherId } });
    btn.textContent = '✓ Avisado';
    alert('Prestador avisado por WhatsApp!');
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
    btn.textContent = '🔔 Cutucar';
  }
}

function messageBubbleHTML(m) {
  const mine = m.sender_id === user.id;
  const attachment = m.attachment_url ? `<img src="${imgProxy(m.attachment_url)}" loading="lazy">` : '';
  return `<div class="bubble ${mine ? 'me' : 'them'}">${esc(m.content)}${attachment}<div class="bubble-time">${timeFmt(m.created_at)}</div></div>`;
}

let currentChatRequestId = null;
let currentChatProviderId = null;
let chatReconnectAttempts = 0;

function connectChatSocket(requestId, providerId) {
  if (chatSocket) chatSocket.close();
  currentChatRequestId = requestId;
  currentChatProviderId = providerId;
  chatReconnectAttempts = 0;
  openChatSocket(requestId, providerId);
}

function openChatSocket(requestId, providerId) {
  const httpBase = API_BASE || window.location.origin;
  const wsBase = httpBase.replace(/^http/, 'ws');
  const socket = new WebSocket(`${wsBase}/ws/chat?token=${token}&requestId=${requestId}&providerId=${providerId}`);
  chatSocket = socket;
  socket.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type !== 'message') return;
    const m = payload.data;
    if (renderedMessageIds.has(m.id)) return;
    renderedMessageIds.add(m.id);
    const body = document.getElementById('chat-body');
    body.insertAdjacentHTML('beforeend', messageBubbleHTML(m));
    body.scrollTop = body.scrollHeight;
  };
  // Conexão pode cair sozinha (troca de rede no celular, app em segundo
  // plano, deploy no servidor) — sem isso o chat fica "morto" em silêncio,
  // sem nenhum erro visível, até o usuário sair e voltar na tela manualmente.
  socket.onclose = () => {
    if (chatSocket !== socket) return; // essa conexão já foi substituída por outra, ignora
    if (currentChatRequestId !== requestId || currentChatProviderId !== providerId) return; // já saiu dessa conversa, não reconecta
    if (chatReconnectAttempts >= 5) return;
    chatReconnectAttempts++;
    setTimeout(() => {
      if (currentChatRequestId === requestId && currentChatProviderId === providerId) openChatSocket(requestId, providerId);
    }, Math.min(1000 * chatReconnectAttempts, 5000));
  };
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content) return;

  input.value = '';
  const m = await api(`/requests/${currentChat.requestId}/messages`, {
    method: 'POST',
    body: { content, providerId: currentThreadProviderId() },
  });
  if (m.blocked) alert('Removemos um contato (telefone, e-mail ou CEP) dessa mensagem — combine tudo pelo app até o pagamento.');
  if (renderedMessageIds.has(m.id)) return; // já apareceu via eco do WebSocket
  renderedMessageIds.add(m.id);
  const body = document.getElementById('chat-body');
  body.insertAdjacentHTML('beforeend', messageBubbleHTML(m));
  body.scrollTop = body.scrollHeight;
}

// ---------- Perfil ----------
async function changeProfilePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('photo', file);
  try {
    const { photoUrl } = await api('/auth/me/photo', { method: 'PUT', body: fd });
    user.photoUrl = photoUrl;
    localStorage.setItem('chama_user', JSON.stringify(user));
    document.getElementById('profile-avatar').src = photoUrl;
  } catch (err) {
    alert(err.message);
  } finally {
    input.value = '';
  }
}

async function loadProfile() {
  document.getElementById('profile-avatar').src = avatarSrc(user);
  document.getElementById('profile-name').textContent = user.name;
  document.getElementById('profile-email').textContent = user.email;

  const verifiedCard = document.getElementById('profile-verified-card');
  const roleBadge = document.getElementById('profile-role-badge');
  const statsSection = document.getElementById('profile-stats-section');
  const shortcuts = document.getElementById('profile-shortcuts');
  const extra = document.getElementById('profile-extra');

  if (user.role === 'provider') {
    const p = await api(`/providers/${user.id}`);
    roleBadge.innerHTML = `${p.is_founder ? '<span class="badge-founder">🏆 Fundador</span>' : ''}${p.is_subscriber ? '<span class="badge-pro">⭐ PRO</span>' : ''}<span class="role-badge">${p.level || 'Bronze'}</span>`;
    const verificationLabels = { pending: 'Verificação em análise', active: 'Conta verificada', suspended: 'Conta suspensa', rejected: 'Verificação rejeitada' };
    verifiedCard.style.display = 'flex';
    document.getElementById('profile-verified-title').textContent = verificationLabels[p.status] || p.status;
    document.getElementById('profile-verified-sub').textContent = (p.categories || []).join(', ') || 'Nenhuma categoria informada';

    statsSection.innerHTML = '';
    shortcuts.innerHTML = `
      <div class="shortcut-card" onclick="setTab('provider-earnings')"><div class="icon" style="background:var(--primary-tint);color:var(--primary-dark);">💰</div><div class="txt"><strong>Carteira</strong><span>Moedas e ganhos</span></div></div>
      <div class="shortcut-card" onclick="setTab('provider-jobs')"><div class="icon" style="background:var(--info-tint);color:var(--info);">🧰</div><div class="txt"><strong>Trabalhos</strong><span>Meus serviços</span></div></div>
      <div class="shortcut-card" onclick="showScreen('referral')" data-load="referral"><div class="icon" style="background:var(--purple-tint);color:var(--purple);">🎁</div><div class="txt"><strong>Indique e ganhe</strong><span>Compartilhe seu código</span></div></div>
      <div class="shortcut-card" onclick="showScreen('provider-verification')"><div class="icon" style="background:var(--success-tint);color:var(--success);">🪪</div><div class="txt"><strong>Verificação</strong><span>Documento e selfie</span></div></div>
      <div class="shortcut-card" onclick="showScreen('provider-categories')"><div class="icon" style="background:var(--info-tint);color:var(--info);">🏷️</div><div class="txt"><strong>Categorias</strong><span>O que você atende</span></div></div>
      <div class="shortcut-card" onclick="showScreen('provider-installments')" data-load="provider-installments"><div class="icon" style="background:var(--purple-tint);color:var(--purple);">💳</div><div class="txt"><strong>Parcelamento</strong><span>Taxas e até 6x no cartão</span></div></div>
      <div class="shortcut-card" onclick="showScreen('provider-portfolio')" data-load="provider-portfolio"><div class="icon" style="background:var(--info-tint);color:var(--info);">📸</div><div class="txt"><strong>Fotos e sobre você</strong><span>Descrição e trabalhos realizados</span></div></div>
      <div class="shortcut-card" onclick="openHowItWorks('profile')"><div class="icon" style="background:var(--warning-tint);color:var(--warning);">ℹ️</div><div class="txt"><strong>Como funciona</strong><span>Comissão, moedas e saque</span></div></div>
      <div class="shortcut-card" onclick="callSupport()"><div class="icon" style="background:var(--success-tint);color:var(--success);">💬</div><div class="txt"><strong>Suporte</strong><span>Fale pelo WhatsApp</span></div></div>
      <div class="shortcut-card" onclick="showScreen('provider-subscription'); loadSubscriptionStatus();"><div class="icon" style="background:var(--warning-tint);color:var(--warning);">⭐</div><div class="txt"><strong>Plano PRO</strong><span>Destaque e prioridade</span></div></div>
    `;

    extra.innerHTML = '';
  } else {
    roleBadge.innerHTML = '';
    verifiedCard.style.display = 'flex';
    const complete = !!(user.document && user.neighborhood && user.city);
    document.getElementById('profile-verified-title').textContent = complete ? 'Perfil completo' : 'Complete seu perfil';
    document.getElementById('profile-verified-sub').textContent = complete ? 'Seus dados ajudam a agilizar pagamentos e pedidos.' : 'Adicione CPF e endereço para agilizar pagamentos.';

    const stats = await api('/auth/me/stats');
    statsSection.innerHTML = `
      <div class="section-title"><h3>Resumo da conta</h3></div>
      <div class="stat-grid">
        <div class="stat-box"><div class="num">${stats.requestsMade}</div><div class="lab">Solicitações</div></div>
        <div class="stat-box"><div class="num">${stats.servicesCompleted}</div><div class="lab">Concluídos</div></div>
        <div class="stat-box"><div class="num">${money(stats.totalSpent)}</div><div class="lab">Total gasto</div></div>
        <div class="stat-box"><div class="num">${stats.referralsCount}</div><div class="lab">Indicações</div></div>
      </div>
    `;

    shortcuts.innerHTML = `
      <div class="shortcut-card" onclick="setTab('my-requests')"><div class="icon" style="background:var(--info-tint);color:var(--info);">📋</div><div class="txt"><strong>Meus pedidos</strong><span>Acompanhe suas solicitações</span></div></div>
      <div class="shortcut-card" onclick="showScreen('favorites')"><div class="icon" style="background:var(--danger-tint);color:var(--danger);">♥</div><div class="txt"><strong>Favoritos</strong><span>Prestadores salvos</span></div></div>
      <div class="shortcut-card" onclick="showScreen('referral')"><div class="icon" style="background:var(--purple-tint);color:var(--purple);">🎁</div><div class="txt"><strong>Indique e ganhe</strong><span>Compartilhe seu código</span></div></div>
      <div class="shortcut-card" onclick="openComingSoon('Minhas avaliações')"><div class="icon" style="background:var(--warning-tint);color:var(--warning);">⭐</div><div class="txt"><strong>Avaliações</strong><span>Em breve</span></div></div>
    `;

    if (complete && !editingProfileData) {
      extra.innerHTML = `
        <div class="section-title"><h3>Dados para pagamento</h3></div>
        <div class="card">
          <p style="font-size:12.5px;color:var(--ink-soft);margin:0;">CPF: ${user.document || '—'}</p>
          <p style="font-size:12.5px;color:var(--ink-soft);margin:6px 0 0;">
            ${user.street || ''}, ${user.streetNumber || ''}${user.complement ? ' - ' + user.complement : ''}<br>
            ${user.neighborhood || ''} — ${user.city || ''} · CEP ${user.zipCode || ''}
          </p>
          <button class="btn btn-ghost btn-small" style="margin-top:10px;" onclick="editProfileData()">Editar dados</button>
        </div>
      `;
    } else {
      extra.innerHTML = `
        <div class="section-title"><h3>Dados para pagamento</h3></div>
        <div class="field">
          <label>CPF (opcional, ajuda a evitar bloqueio no pagamento com cartão)</label>
          <input id="profile-document" placeholder="Somente números" value="${user.document || ''}">
        </div>
        <div class="section-title"><h3>Endereço completo</h3></div>
        <p style="font-size:12px;color:var(--ink-soft);margin:-6px 0 10px;">Fica salvo só na sua conta. Ao pedir um serviço, o prestador só vê bairro/cidade antes de aceitar — a rua e o número são liberados pra ele depois que você aceitar uma proposta e pagar.</p>
        <div class="field"><label>CEP</label><input id="profile-zip" placeholder="00000000" value="${user.zipCode || ''}" oninput="autoFillProfileCep(this.value)"></div>
        <div class="field"><label>Rua</label><input id="profile-street" value="${user.street || ''}"></div>
        <div style="display:flex;gap:10px;">
          <div class="field" style="flex:1;"><label>Número</label><input id="profile-street-number" value="${user.streetNumber || ''}"></div>
          <div class="field" style="flex:1;"><label>Complemento</label><input id="profile-complement" value="${user.complement || ''}"></div>
        </div>
        <div style="display:flex;gap:10px;">
          <div class="field" style="flex:1;"><label>Bairro</label><input id="profile-neighborhood" value="${user.neighborhood || ''}"></div>
          <div class="field" style="flex:1;"><label>Cidade</label><input id="profile-city" value="${user.city || ''}"></div>
        </div>
        <button class="btn btn-primary btn-block btn-small" onclick="saveProfileDocument()">Salvar dados</button>
        ${editingProfileData ? `<button class="btn btn-ghost btn-block btn-small" style="margin-top:8px;" onclick="cancelEditProfileData()">Cancelar</button>` : ''}
        <div class="error-msg" id="profile-document-msg"></div>
      `;
    }
  }
}

let editingProfileData = false;

function editProfileData() {
  editingProfileData = true;
  loadProfile();
}

function cancelEditProfileData() {
  editingProfileData = false;
  loadProfile();
}

async function autoFillProfileCep(value) {
  const data = await lookupCep(value);
  if (!data) return;
  document.getElementById('profile-street').value = data.street;
  document.getElementById('profile-neighborhood').value = data.neighborhood;
  document.getElementById('profile-city').value = data.city;
}

async function saveProfileDocument() {
  const msgEl = document.getElementById('profile-document-msg');
  const body = {
    document: document.getElementById('profile-document').value.trim(),
    zipCode: document.getElementById('profile-zip').value.trim(),
    street: document.getElementById('profile-street').value.trim(),
    streetNumber: document.getElementById('profile-street-number').value.trim(),
    complement: document.getElementById('profile-complement').value.trim(),
    neighborhood: document.getElementById('profile-neighborhood').value.trim(),
    city: document.getElementById('profile-city').value.trim(),
  };
  try {
    const updated = await api('/auth/me', { method: 'PATCH', body });
    Object.assign(user, { document: updated.document, zipCode: updated.zipCode, street: updated.street, streetNumber: updated.streetNumber, complement: updated.complement, neighborhood: updated.neighborhood, city: updated.city });
    localStorage.setItem('chama_user', JSON.stringify(user));
    editingProfileData = false;
    await loadProfile();
  } catch (err) {
    msgEl.style.color = 'var(--danger)';
    msgEl.textContent = err.message;
  }
}

// ---------- Favoritos ----------
async function renderFavoritesScreen() {
  const favs = await api('/providers/favorites/mine');
  document.getElementById('favorites-list').innerHTML = favs.length ? favs.map((p) => `
    <div class="req-card" onclick="viewProviderProfile('${p.id}','favorites')">
      <div class="ticket-row" style="align-items:center;">
        <img class="avatar" src="${avatarSrc(p)}" style="border-radius:50%;" loading="lazy">
        <div class="ticket-info">
          <div class="name-row"><span class="name">${p.name}</span></div>
          <div class="stars">★ ${p.rating_avg ? parseFloat(p.rating_avg).toFixed(1) : '—'} · ${(p.categories || [])[0] || ''}</div>
        </div>
      </div>
    </div>
  `).join('') : '<div class="empty-state"><span class="glyph">♥</span><p>Você ainda não favoritou nenhum prestador.</p></div>';
}

// ---------- Todos os profissionais ----------
let allProvidersCategory = null;

function viewProvidersForRequestCategory() {
  allProvidersCategory = requestDraft?.category || null;
  showScreen('all-providers');
}

async function renderAllProvidersScreen() {
  const el = document.getElementById('all-providers-list');
  const sortWrap = document.getElementById('all-providers-sort-wrap');
  document.getElementById('all-providers-title').textContent = allProvidersCategory || 'Profissionais';
  sortWrap.style.display = allProvidersCategory ? '' : 'none';
  const sort = allProvidersCategory ? document.getElementById('all-providers-sort').value : '';
  el.innerHTML = '<div class="empty-state" style="padding:40px 20px;"><p>Carregando...</p></div>';
  const query = allProvidersCategory
    ? `?category=${encodeURIComponent(allProvidersCategory)}${sort ? `&sort=${sort}` : ''}`
    : '';
  const providers = await api(`/providers/directory/list${query}`);
  el.innerHTML = providers.length ? `<div class="provider-grid">${providers.map((p) => `
    <div class="p-card" onclick="viewProviderProfile('${p.id}','all-providers')">
      <div class="p-photo"><img src="${avatarSrc(p)}" loading="lazy"></div>
      <div class="p-name">${firstNameLastInitial(p.name)}${p.is_founder ? ' 🏆' : ''}${p.is_subscriber ? ' ⭐' : ''}${p.featured ? '<span class="badge-featured">★</span>' : ''}</div>
      <div class="p-role">${(p.categories || [])[0] || 'Prestador'}</div>
      <div class="p-rating">★ ${p.rating_avg ? parseFloat(p.rating_avg).toFixed(1) : '—'} (${p.rating_count || 0})</div>
      ${p.min_catalog_price != null ? `<div class="p-role" style="color:var(--primary);font-weight:700;">a partir de ${money(p.min_catalog_price)}</div>` : ''}
      ${p.has_km_rate ? `<div class="p-role" style="color:var(--primary);font-weight:700;">preço por km</div>` : ''}
    </div>
  `).join('')}</div>` : '<div class="empty-state"><span class="glyph">🔍</span><p>Nenhum profissional cadastrado ainda.</p></div>';
}

const _origShowScreen = showScreen;
showScreen = function (id) {
  _origShowScreen(id);
  if (id === 'favorites') renderFavoritesScreen();
  if (id === 'all-providers') renderAllProvidersScreen();
  if (id === 'referral') renderReferralScreen();
  if (id === 'select-city') loadCityList();
  if (id === 'provider-withdraw') loadWithdrawScreen();
  if (id === 'provider-categories') loadProviderCategoriesScreen();
  if (id === 'provider-installments') loadProviderInstallmentsScreen();
  if (id === 'provider-portfolio') loadProviderPortfolioScreen();
};

// ---------- Fotos de trabalhos realizados (portfólio do prestador) ----------
const MAX_PORTFOLIO_PHOTOS = 6;

async function loadProviderPortfolioScreen() {
  document.getElementById('portfolio-error').textContent = '';
  document.getElementById('provider-bio-error').textContent = '';

  const [photos, profile] = await Promise.all([
    api('/providers/portfolio/mine'),
    api(`/providers/${user.id}`),
  ]);
  renderPortfolioGrid(photos);
  document.getElementById('portfolio-upload-box').style.display = photos.length >= MAX_PORTFOLIO_PHOTOS ? 'none' : '';
  document.getElementById('provider-bio-input').value = profile.bio || '';
}

async function saveProviderBio() {
  const errorEl = document.getElementById('provider-bio-error');
  errorEl.textContent = '';
  const bio = document.getElementById('provider-bio-input').value.trim();
  try {
    await api('/providers/bio', { method: 'PUT', body: { bio } });
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

function renderPortfolioGrid(photos) {
  document.getElementById('portfolio-grid').innerHTML = photos.map((p) => `
    <div class="portfolio-item">
      <img src="${imgProxy(p.photo_url)}" loading="lazy">
      <button class="remove-btn" onclick="deletePortfolioPhoto('${p.id}')">&times;</button>
    </div>
  `).join('');
}

async function uploadPortfolioPhotoFile(input) {
  const file = input.files[0];
  if (!file) return;
  const errorEl = document.getElementById('portfolio-error');
  errorEl.textContent = '';
  const fd = new FormData();
  fd.append('photo', file);
  try {
    await api('/providers/portfolio', { method: 'POST', body: fd });
    input.value = '';
    loadProviderPortfolioScreen();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

async function deletePortfolioPhoto(id) {
  if (!confirm('Remover essa foto do seu perfil?')) return;
  await api(`/providers/portfolio/${id}`, { method: 'DELETE' });
  loadProviderPortfolioScreen();
}

async function loadProviderInstallmentsScreen() {
  const errorEl = document.getElementById('installments-error');
  errorEl.textContent = '';
  try {
    const data = await api('/provider/installments-settings');
    document.getElementById('installments-toggle').checked = data.allowInstallments;
    document.getElementById('installments-max-label').textContent = data.maxInstallments;
    document.getElementById('installments-min-label').textContent = money(data.minAmount);
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

async function toggleInstallmentsSetting() {
  const toggle = document.getElementById('installments-toggle');
  const errorEl = document.getElementById('installments-error');
  errorEl.textContent = '';
  try {
    await api('/provider/installments-settings', { method: 'PUT', body: { allowInstallments: toggle.checked } });
  } catch (err) {
    toggle.checked = !toggle.checked;
    errorEl.textContent = err.message;
  }
}

// ---------- Cidade selecionada (banners regionais do franqueado) ----------
function getSelectedCity() {
  try {
    return JSON.parse(localStorage.getItem('chama_selected_city') || 'null') || {};
  } catch {
    return {};
  }
}

let availableCitiesCache = [];

async function loadCityList() {
  if (!availableCitiesCache.length) availableCitiesCache = await api('/cities/active');
  document.getElementById('select-city-search').value = '';
  renderCityList(availableCitiesCache);
}

function filterCityList(query) {
  const q = normalize(query);
  const filtered = availableCitiesCache.filter((c) => normalize(`${c.city} ${c.state}`).includes(q));
  renderCityList(filtered);
}

function renderCityList(cities) {
  const el = document.getElementById('select-city-list');
  if (!cities.length) {
    el.innerHTML = availableCitiesCache.length
      ? '<div class="empty-state"><span class="glyph">🔍</span><p>Nenhuma cidade encontrada.</p></div>'
      : '<div class="empty-state"><span class="glyph">📍</span><p>Ainda não atendemos nenhuma cidade cadastrada. Volte em breve!</p></div>';
    return;
  }
  el.innerHTML = cities.map((c) => `
    <div class="list-item" onclick="selectCity('${c.city.replace(/'/g, "\\'")}','${c.state}')">
      <div class="icon" style="background:var(--primary-tint);color:var(--primary-dark);">📍</div>
      <div class="txt"><strong>${c.city}</strong><span>${c.state}</span></div>
      <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
    </div>
  `).join('');
}

function setSelectedCityState(city, state) {
  localStorage.setItem('chama_selected_city', JSON.stringify({ city, state }));
  localStorage.setItem('chama_city_prompt_seen', '1');
}

function selectCity(city, state) {
  setSelectedCityState(city, state);
  showScreen(homeScreenId());
  if (homeScreenId() === 'home') loadHomeCategories();
  else loadOpenRequests();
}

function clearCitySelection() {
  localStorage.removeItem('chama_selected_city');
  localStorage.setItem('chama_city_prompt_seen', '1');
  showScreen(homeScreenId());
  if (homeScreenId() === 'home') loadHomeCategories();
  else loadOpenRequests();
}

function renderReferralScreen() {
  document.getElementById('referral-code').textContent = user.referralCode || '—';
  const isClient = user.role === 'client';
  document.getElementById('redeem-coins-card').style.display = isClient ? 'block' : 'none';
  document.getElementById('provider-coins-note').style.display = isClient ? 'none' : 'block';
  document.getElementById('redeem-coins-error').textContent = '';
  document.getElementById('redeem-coins-result').style.display = 'none';
  api('/auth/me/stats').then((s) => {
    document.getElementById('referral-count').textContent = s.referralsCount;
  }).catch(() => { document.getElementById('referral-count').textContent = '0'; });
  api('/my-coins').then((c) => {
    document.getElementById('referral-coins').textContent = c.balance;
  }).catch(() => { document.getElementById('referral-coins').textContent = '0'; });
}

function copyReferralCode() {
  if (!user.referralCode) return;
  navigator.clipboard?.writeText(user.referralCode);
  alert('Código copiado: ' + user.referralCode);
}

async function redeemCoinsForDiscount() {
  const errorEl = document.getElementById('redeem-coins-error');
  errorEl.textContent = '';
  const coins = parseInt(document.getElementById('redeem-coins-input').value, 10);
  if (!coins || coins < 100 || coins % 100 !== 0) {
    errorEl.textContent = 'O resgate precisa ser em múltiplos de 100 moedas.';
    return;
  }
  try {
    const result = await api('/my-coins/redeem', { method: 'POST', body: { coins } });
    document.getElementById('redeem-coins-code').textContent = result.code;
    document.getElementById('redeem-coins-result').style.display = 'block';
    api('/my-coins').then((c) => { document.getElementById('referral-coins').textContent = c.balance; });
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

// ---------- Boot ----------
// Link direto pro cadastro: nexserv.com.br/app/?cadastro=prestador (ou
// ?cadastro=cliente) já abre a tela de cadastro com o tipo certo selecionado.
// Alguns encurtadores/ferramentas de anúncio colam parâmetros de rastreamento
// (fbclid, utm_*) com um "?" extra em vez de "&" (ex: "?cadastro=prestador?fbclid=...") —
// isso quebra o URLSearchParams normal, então corrige trocando "?" extras por "&"
// antes de parsear, pra nunca depender de como cada ferramenta monta o link.
const rawBootQuery = window.location.search.replace(/^\?/, '').replace(/\?/g, '&');
const bootParams = new URLSearchParams(rawBootQuery);

// Mesma captura de origem (utm_source/medium/campaign ou referrer) da
// landing — cobre quem cai direto no /app/ (link de anúncio direto, sem
// passar pela home) sem sobrescrever o que já foi capturado antes.
(function captureSignupAttribution() {
  if (localStorage.getItem('chama_signup_attribution')) return;
  const utmSource = bootParams.get('utm_source');
  const hasUtm = utmSource || bootParams.get('utm_medium') || bootParams.get('utm_campaign');
  if (!hasUtm && !document.referrer) return;
  localStorage.setItem('chama_signup_attribution', JSON.stringify({
    source: utmSource || null,
    medium: bootParams.get('utm_medium') || null,
    campaign: bootParams.get('utm_campaign') || null,
    content: bootParams.get('utm_content') || null,
    referrer: document.referrer || null,
  }));
})();

// Navegação livre: visitante sem conta cai direto na home do cliente, com
// categorias e prestadores em destaque, igual quem já está logado — só pede
// cadastro quando ele tenta de fato pedir um orçamento (ver openRequestForm)
// ou entrar numa aba que precisa de conta (ver setTab).
function enterGuestMode() {
  user = GUEST_USER;
  enterApp();
}

const resetTokenParam = bootParams.get('reset');
if (resetTokenParam) {
  openResetPassword(resetTokenParam);
} else if (token && user) {
  enterApp();
} else {
  const cadastroParam = bootParams.get('cadastro');
  if (cadastroParam === 'prestador') openRegister('provider');
  else if (cadastroParam === 'cliente') openRegister('client');
  else if (bootParams.get('login') === '1') goToLogin();
  else enterGuestMode();
}
