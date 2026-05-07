import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "vinci.app.language";

export const LANGUAGE_OPTIONS = [
  { label: "English", value: "en" },
  { label: "Português (Brasil)", value: "pt-BR" },
  { label: "Español", value: "es" },
];

const DEFAULT_LANGUAGE = "en";

const EXACT_TRANSLATIONS = {
  "pt-BR": {
    Dashboard: "Painel",
    Analytics: "Análises",
    Media: "Mídia",
    Playlists: "Playlists",
    Settings: "Configurações",
    Language: "Idioma",
    English: "Inglês",
    "Choose your preferred language for the Vince Shoppable Videos app interface.":
      "Escolha seu idioma preferido para a interface do app Vince Shoppable Videos.",
    "Plans & Pricing": "Planos e Preços",
    "Widget Settings": "Configurações do Widget",
    About: "Sobre",
    Plan: "Plano",
    Free: "Grátis",
    Premium: "Premium",
    "Current Plan": "Plano Atual",
    "Refresh status": "Atualizar status",
    "Analytics is available on paid plans": "Análises disponíveis apenas em planos pagos",
    "View plans and upgrade": "Ver planos e fazer upgrade",
    "Analytics Dashboard": "Painel de Análises",
    "Live Session View": "Visão de Sessão em Tempo Real",
    "Total Attributed Revenue": "Receita Atribuída Total",
    "Attributed Orders": "Pedidos Atribuídos",
    "Product Conversion Rate": "Taxa de Conversão de Produto",
    "Avg. Order Value (Video)": "Valor Médio do Pedido (Vídeo)",
    "Top Products by Revenue": "Top Produtos por Receita",
    "Products Performance": "Desempenho de Produtos",
    "Videos Performance": "Desempenho dos Vídeos",
    "All Carousels": "Todos os Carrosséis",
    "All Videos": "Todos os Vídeos",
    Previous: "Anterior",
    Next: "Próximo",
    Expand: "Expandir",
    "Show Top 10": "Mostrar Top 10",
    "No product data available for the selected filters.":
      "Nenhum dado de produto disponível para os filtros selecionados.",
    "Welcome to Vinci Shoppable Videos":
      "Bem-vindo ao Vinci Shoppable Videos",
    "Open Products": "Abrir produtos",
    "Open Customers": "Abrir clientes",
    "Setup Guide": "Guia de configuração",
    Collapse: "Recolher",
    "Complete setup steps to maximize your store's potential.":
      "Conclua as etapas para maximizar o potencial da sua loja.",
    Done: "Concluído",
    Pending: "Pendente",
    Hide: "Ocultar",
    Show: "Mostrar",
    Open: "Abrir",
    "Install Vinci Shoppable Videos": "Instale o Vinci Shoppable Videos",
    "Add Videos and Tag Products": "Adicione vídeos e marque produtos",
    "Create Your First Playlist": "Crie sua primeira playlist",
    "Show Playlists on Store Pages": "Mostre playlists nas páginas da loja",
    "Complete the installation process and set up your Vinci Shoppable Videos account to start creating engaging content.":
      "Conclua a instalação e configure sua conta do Vinci Shoppable Videos para começar a criar conteúdo envolvente.",
    "Upload media and connect products to make your content shoppable.":
      "Envie mídia e conecte produtos para tornar seu conteúdo comprável.",
    "Group your content into playlists for more organized storefront experiences.":
      "Agrupe seu conteúdo em playlists para uma experiência mais organizada.",
    "Complete setup in the Theme Editor so playlists appear on your store pages.":
      "Conclua a configuração no Editor de Tema para exibir playlists na loja.",
    "Open Settings": "Abrir configurações",
    "Add Content": "Adicionar conteúdo",
    "Create Playlist": "Criar playlist",
    "Playlists is available on paid plans":
      "Playlists disponível apenas em planos pagos",
    "Content Library": "Biblioteca de conteúdo",
    "Manage your videos and images": "Gerencie seus vídeos e imagens",
    "Delete Items": "Excluir itens",
    "Import URL": "Importar URL",
    "Upload Media": "Enviar mídia",
    "Widget controls are now managed directly in the Theme Editor.":
      "Os controles do widget agora são gerenciados diretamente no Editor de Tema.",
    "App Information": "Informações do aplicativo",
    Version: "Versão",
    "Build Date": "Data da build",
    Environment: "Ambiente",
    Production: "Produção",
    "Support & Resources": "Suporte e recursos",
    Documentation: "Documentação",
    Support: "Suporte",
    "Email Support": "Suporte por email",
    "No active subscription found.": "Nenhuma assinatura ativa encontrada.",
    "Use Vinci Shoppable Videos for free.":
      "Use o Vinci Shoppable Videos gratuitamente.",
    "Best for growing stores.": "Ideal para lojas em crescimento.",
    "Switch to Monthly": "Mudar para mensal",
    "Switch to Free Plan": "Mudar para plano grátis",
    "Choose Monthly": "Escolher mensal",
    "Choose Yearly": "Escolher anual",
    "Yearly active": "Anual ativo",
    "Monthly active": "Mensal ativo",
    "No analytics": "Sem análises",
    "Full analytics dashboard": "Painel completo de análises",
    "Priority support": "Suporte prioritário",
    "Unlimited video upload": "Upload ilimitado de vídeos",
    "Unlimited playlists": "Playlists ilimitadas",
    "Unlimited videos per playlist": "Vídeos ilimitados por playlist",
    "No watermark": "Sem marca d'água",
    "Media uploaded": "Mídia enviada",
    "Upload media": "Enviar mídia",
    "Playlist created": "Playlist criada",
    "Create playlist": "Criar playlist",
    "Legacy settings found": "Configurações legadas encontradas",
    "Theme Editor active": "Editor de Tema ativo",
    "How to Add in Theme Editor": "Como adicionar no Editor de Tema",
    "Theme app extension setup": "Configuração da extensão de tema",
    "Open Theme Editor": "Abrir Editor de Tema",
    "Your playlists are not visible on your store yet":
      "Suas playlists ainda não estão visíveis na loja",
    Delete: "Excluir",
    "Deleting...": "Excluindo...",
    Cancel: "Cancelar",
    Skip: "Pular",
    Saving: "Salvando...",
    "Loading media...": "Carregando mídia...",
    "No media available yet.": "Nenhuma mídia disponível ainda.",
    "Are you sure you want to cancel your Premium subscription? Billing changes follow Shopify subscription rules.":
      "Tem certeza de que deseja cancelar sua assinatura Premium? As alterações de cobrança seguem as regras de assinatura da Shopify.",
    "Could not cancel subscription.": "Não foi possível cancelar a assinatura.",
  },
  es: {
    Dashboard: "Panel",
    Analytics: "Analíticas",
    Media: "Medios",
    Playlists: "Listas",
    Settings: "Configuración",
    Language: "Idioma",
    English: "Inglés",
    "Choose your preferred language for the Vince Shoppable Videos app interface.":
      "Elige tu idioma preferido para la interfaz de la app Vince Shoppable Videos.",
    "Plans & Pricing": "Planes y Precios",
    "Widget Settings": "Configuración del Widget",
    About: "Acerca de",
    Plan: "Plan",
    Free: "Gratis",
    Premium: "Premium",
    "Current Plan": "Plan Actual",
    "Refresh status": "Actualizar estado",
    "Analytics is available on paid plans":
      "Las analíticas están disponibles solo en planes pagos",
    "View plans and upgrade": "Ver planes y mejorar",
    "Analytics Dashboard": "Panel de Analíticas",
    "Live Session View": "Vista de Sesión en Vivo",
    "Total Attributed Revenue": "Ingresos Atribuidos Totales",
    "Attributed Orders": "Pedidos Atribuidos",
    "Product Conversion Rate": "Tasa de Conversión de Producto",
    "Avg. Order Value (Video)": "Valor Promedio del Pedido (Video)",
    "Top Products by Revenue": "Productos Top por Ingresos",
    "Products Performance": "Rendimiento de Productos",
    "Videos Performance": "Rendimiento de Videos",
    "All Carousels": "Todos los Carruseles",
    "All Videos": "Todos los Videos",
    Previous: "Anterior",
    Next: "Siguiente",
    Expand: "Expandir",
    "Show Top 10": "Mostrar Top 10",
    "No product data available for the selected filters.":
      "No hay datos de productos para los filtros seleccionados.",
    "Welcome to Vinci Shoppable Videos":
      "Bienvenido a Vinci Shoppable Videos",
    "Open Products": "Abrir productos",
    "Open Customers": "Abrir clientes",
    "Setup Guide": "Guía de configuración",
    Collapse: "Colapsar",
    "Complete setup steps to maximize your store's potential.":
      "Completa los pasos para maximizar el potencial de tu tienda.",
    Done: "Listo",
    Pending: "Pendiente",
    Hide: "Ocultar",
    Show: "Mostrar",
    Open: "Abrir",
    "Install Vinci Shoppable Videos": "Instala Vinci Shoppable Videos",
    "Add Videos and Tag Products": "Agregar videos y etiquetar productos",
    "Create Your First Playlist": "Crea tu primera lista",
    "Show Playlists on Store Pages": "Muestra listas en páginas de la tienda",
    "Open Settings": "Abrir configuración",
    "Add Content": "Agregar contenido",
    "Create Playlist": "Crear lista",
    "Content Library": "Biblioteca de contenido",
    "Manage your videos and images": "Gestiona tus videos e imágenes",
    "Delete Items": "Eliminar elementos",
    "Import URL": "Importar URL",
    "Upload Media": "Subir medios",
    "Widget controls are now managed directly in the Theme Editor.":
      "Los controles del widget ahora se gestionan directamente en el Editor de Tema.",
    "App Information": "Información de la app",
    Version: "Versión",
    "Build Date": "Fecha de compilación",
    Environment: "Entorno",
    Production: "Producción",
    "Support & Resources": "Soporte y recursos",
    Documentation: "Documentación",
    Support: "Soporte",
    "Email Support": "Soporte por correo",
    "No active subscription found.": "No se encontró una suscripción activa.",
    "Switch to Monthly": "Cambiar a mensual",
    "Switch to Free Plan": "Cambiar al plan gratis",
    "Choose Monthly": "Elegir mensual",
    "Choose Yearly": "Elegir anual",
    "Yearly active": "Anual activo",
    "Monthly active": "Mensual activo",
    "How to Add in Theme Editor": "Cómo agregar en el Editor de Tema",
    "Theme app extension setup": "Configuración de extensión de tema",
    "Open Theme Editor": "Abrir Editor de Tema",
    Delete: "Eliminar",
    "Deleting...": "Eliminando...",
    Cancel: "Cancelar",
    Skip: "Omitir",
    Saving: "Guardando...",
    "Loading media...": "Cargando medios...",
    "No media available yet.": "Aún no hay medios disponibles.",
    "Are you sure you want to cancel your Premium subscription? Billing changes follow Shopify subscription rules.":
      "¿Seguro que quieres cancelar tu suscripción Premium? Los cambios de facturación siguen las reglas de suscripción de Shopify.",
    "Could not cancel subscription.": "No se pudo cancelar la suscripción.",
  },
};

function getStoredLanguage() {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  // Do not infer from browser/shop locale. Default must always be English
  // unless the merchant explicitly saved a preference.
  const value = window.localStorage.getItem(STORAGE_KEY) || DEFAULT_LANGUAGE;
  return LANGUAGE_OPTIONS.some((option) => option.value === value)
    ? value
    : DEFAULT_LANGUAGE;
}

function replaceTextNodeValue(value, language) {
  if (!value || language === "en") return value;
  const table = EXACT_TRANSLATIONS[language] || {};
  const direct = table[value.trim()];
  if (direct && value.trim() === value) return direct;
  if (direct) return value.replace(value.trim(), direct);
  return value;
}

function translateDom(language) {
  if (typeof document === "undefined" || language === "en") return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current);
    current = walker.nextNode();
  }
  for (const node of nodes) {
    const updated = replaceTextNodeValue(node.nodeValue, language);
    if (updated !== node.nodeValue) {
      node.nodeValue = updated;
    }
  }
}

const I18nContext = createContext({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (value) => value,
  options: LANGUAGE_OPTIONS,
});

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(() => getStoredLanguage());

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, language);
    translateDom(language);
    const observer = new MutationObserver(() => translateDom(language));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);

  const value = useMemo(() => {
    const t = (text) => {
      if (!text || language === "en") return text;
      const table = EXACT_TRANSLATIONS[language] || {};
      return table[text] || text;
    };
    return {
      language,
      setLanguage: setLanguageState,
      t,
      options: LANGUAGE_OPTIONS,
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

