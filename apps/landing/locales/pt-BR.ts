import type { en } from './en-GB'

/**
 * The landing pages in Portuguese.
 *
 * Typed against the English, so a key missing here fails the typecheck.
 *
 * Button names quoted from the app match packages/i18n/locales/pt-BR.json,
 * since someone following the setup guide is looking for those exact words.
 */
const WHATSAPP = 'https://wa.me/447866750132'
const APP = 'https://luminabooth-app.web.app'

export const pt: Record<keyof typeof en, string> = {
  'wa.ask': `${WHATSAPP}?text=${encodeURIComponent('Oi! Estou escrevendo sobre a Lumina.')}`,
  'wa.price': `${WHATSAPP}?text=${encodeURIComponent(
    'Oi! Conheci a Lumina. Quanto custaria a cabine de fotos para a minha festa?',
  )}`,
  'wa.label': 'Fale com a gente no WhatsApp',

  'nav.site': 'Site',
  'nav.more': 'Mais',
  'nav.home': 'Lumina &mdash; in&iacute;cio',
  'nav.openApp': 'Abrir o app',
  'nav.otherLanguage': 'English',
  'nav.setup': 'Guia de montagem',
  'nav.install': 'Salvar na Tela de In&iacute;cio',
  'nav.questions': 'Perguntas',
  'nav.privacy': 'Privacidade',
  'nav.terms': 'Termos',

  'legal.updated': 'Atualizado em 30 de setembro de 2026.',

  // --- the front page ----------------------------------------------------

  'home.title': 'Lumina &mdash; uma cabine de fotos para a sua festa',
  'home.description':
    'Um celular no trip&eacute;, uma impressora pequena e o celular de cada convidado. Eles escaneiam, fazem pose e saem com a foto impressa.',

  'home.hero.heading': 'Uma cabine de fotos que cabe numa sacola',
  'home.hero.lede':
    'Um celular no trip&eacute;, uma impressora pequena e o celular que cada convidado j&aacute; tem no bolso. Eles escaneiam, fazem pose e saem com a foto na m&atilde;o.',
  'home.hero.fine':
    'O app &eacute; gratuito enquanto &eacute; novidade. Sem cart&atilde;o, sem nada para instalar.',
  'home.cta.price': 'Pedir um or&ccedil;amento',
  'home.cta.app': 'Experimentar o app',
  'home.cta.how': 'Ver como funciona',

  'home.how.heading': 'Como funciona',
  'home.how.1.title': 'Coloque um celular no trip&eacute;',
  'home.how.1.body':
    'Abra a Lumina nele e toque em <em>Usar este celular como cabine</em>. Ligue a impressora ao lado. A estrutura &eacute; s&oacute; isso.',
  'home.how.2.title': 'Os convidados escaneiam o c&oacute;digo',
  'home.how.2.body':
    'Um QR code na mesa abre no celular de cada um. &Eacute; ali que eles entram na fila, ent&atilde;o ningu&eacute;m fica parado em frente &agrave; cabine esperando a vez.',
  'home.how.3.title': 'Tr&ecirc;s cliques, uma foto impressa',
  'home.how.3.body':
    'A cabine faz a contagem e tira tr&ecirc;s fotos. Instantes depois, &eacute; uma foto 10&times;15 na m&atilde;o e um link no celular.',

  'home.get.heading': 'O que voc&ecirc; ganha',
  'home.get.1.title': 'Fotos impressas na hora',
  'home.get.1.body':
    'Tamanho 10&times;15, em impressora de sublima&ccedil;&atilde;o, secas assim que saem. &Eacute; o que as pessoas levam para casa de verdade.',
  'home.get.2.title': 'Sem fila na cabine',
  'home.get.2.body':
    'Os convidados pedem a vez pelo pr&oacute;prio celular e a cabine chama cada um. Uma cabine s&oacute; d&aacute; conta de uma fila longa.',
  'home.get.3.title': 'Um link que continua funcionando',
  'home.get.3.body':
    'Cada foto tem a sua p&aacute;gina. Sem app, sem conta, sem login &mdash; abre semanas depois no celular de qualquer pessoa.',
  'home.get.4.title': 'Apagadas em noventa dias',
  'home.get.4.body':
    'As fotos s&atilde;o apagadas automaticamente depois de tr&ecirc;s meses. Cada convidado tamb&eacute;m pode apagar as suas, na cabine ou pelo celular.',
  'home.get.5.title': 'A sua arte na foto',
  'home.get.5.body':
    'Envie um fundo para a festa. O layout deixa um canto livre para ele, e a foto fica com a sua cara, n&atilde;o com cara de modelo pronto.',
  'home.get.6.title': 'Uma ajuda a mais',
  'home.get.6.body':
    'Convide algu&eacute;m para ajudar a cuidar de uma festa. A pessoa v&ecirc; aquela festa e mais nada da sua conta.',

  'home.need.heading': 'O que &eacute; preciso',
  'home.need.intro':
    'A Lumina &eacute; o software. Voc&ecirc; traz um celular; o resto do kit &eacute; alugado com a gente, em Londres.',
  'home.need.phone': '<strong>Um celular</strong>, para ser a cabine. Seu.',
  'home.need.tripod': '<strong>Um trip&eacute;</strong> para apoi&aacute;-lo. Nosso, alugado.',
  'home.need.selphy': '<strong>Uma impressora de fotos Canon SELPHY</strong>. Nossa, alugada.',
  'home.need.pi':
    '<strong>Um Raspberry Pi</strong> &mdash; uma caixinha ao lado da impressora, que faz ela funcionar. Nosso, alugado.',
  'home.need.fine':
    'O Pi entra no seu wifi a partir de um cart&atilde;o colado na caixa &mdash; sem teclado, sem tela, sem digitar endere&ccedil;o IP.',
  'home.need.more': 'Como montar, passo a passo',

  'home.price.heading': 'Quanto custaria para a sua festa?',
  'home.price.1':
    'Pergunte. &Eacute; uma mensagem de WhatsApp para uma pessoa, n&atilde;o um formul&aacute;rio, e perguntar n&atilde;o compromete voc&ecirc; com nada. Diga a data, o lugar em Londres e mais ou menos quantos convidados, e a gente responde com um valor.',
  'home.price.2':
    'N&atilde;o sabe se combina com a sua festa? Pergunte tamb&eacute;m. Mencione a Lumina para sabermos do que se trata &mdash; o bot&atilde;o j&aacute; come&ccedil;a a mensagem para voc&ecirc;.',

  'home.faq.heading': 'Perguntas',
  'home.faq.buy.q': 'Preciso comprar uma impressora?',
  'home.faq.buy.a':
    'N&atilde;o. N&oacute;s alugamos o kit: uma impressora Canon SELPHY, o Raspberry Pi que faz ela funcionar e um trip&eacute; para o celular. Voc&ecirc; entra com o celular.',
  'home.faq.where.q': 'Onde posso alugar o kit?',
  'home.faq.where.a':
    'Em Londres, por enquanto. O app funciona em qualquer lugar, mas sem o kit n&atilde;o h&aacute; fotos impressas &mdash; os convidados ainda recebem as fotos por link.',
  'home.faq.cost.q': 'Quanto custa alugar o kit?',
  'home.faq.cost.a':
    '<a href="{{wa.price}}" target="_blank" rel="noopener">Mande uma mensagem no WhatsApp</a> com a data e o n&uacute;mero aproximado de convidados e a gente envia um valor. O bot&atilde;o verde no canto de todas as p&aacute;ginas serve para o resto &mdash; uma d&uacute;vida, um coment&aacute;rio ou algo que n&atilde;o est&aacute; funcionando.',
  'home.faq.guests.q': 'Os convidados precisam instalar alguma coisa?',
  'home.faq.guests.a':
    'N&atilde;o. Eles escaneiam o QR code e ele abre no navegador do celular. Sem app, sem conta.',
  'home.faq.app.q': 'Eu preciso instalar um app?',
  'home.faq.app.a':
    'N&atilde;o, a Lumina roda no navegador. Mas fica melhor em tela cheia, principalmente no celular que vai ser a cabine &mdash; <a href="{{base}}/install/">salve na sua tela de in&iacute;cio</a>.',
  'home.faq.wifi.q': 'O local precisa ter wifi?',
  'home.faq.wifi.a':
    'Sim. A caixa da impressora precisa de uma rede wifi cuja senha voc&ecirc; saiba, e o celular da cabine precisa estar conectado &agrave; internet. Onde n&atilde;o houver wifi, o roteador de um celular resolve. Wifi que exige login numa p&aacute;gina antes, como o de alguns hot&eacute;is, n&atilde;o funciona para a impressora.',
  'home.faq.time.q': 'Quanto tempo leva para montar?',
  'home.faq.time.a':
    'Poucos minutos, com a senha do wifi em m&atilde;os: ligar na tomada, entrar na rede de configura&ccedil;&atilde;o da impressora, digitar um c&oacute;digo. O <a href="{{base}}/setup/">guia de montagem</a> tem todos os passos.',
  'home.faq.prints.q': 'Qual o tamanho das fotos, e quanto tempo demora?',
  'home.faq.prints.a':
    'Tamanho 10&times;15, com tr&ecirc;s fotos em cada uma. Cada impress&atilde;o leva cerca de um minuto, e elas saem uma de cada vez, na ordem em que as pessoas posaram.',
  'home.faq.paper.q': 'E se acabar o papel da impressora?',
  'home.faq.paper.a':
    'Nada se perde. Cada foto &eacute; salva assim que &eacute; tirada e o convidado recebe o link de qualquer jeito. A tela da sua festa mostra o estado da impressora, e dali voc&ecirc; pode imprimir qualquer foto de novo depois de repor o papel.',
  'home.faq.photos.q': 'O que acontece com as fotos depois?',
  'home.faq.photos.a':
    'Elas ficam guardadas por 90 dias depois da festa e ent&atilde;o s&atilde;o apagadas. Voc&ecirc; pode baixar todas antes disso, e cada convidado pode apagar as suas antes. Os detalhes est&atilde;o na <a href="{{base}}/privacy/">pol&iacute;tica de privacidade</a>.',
  'home.faq.design.q': 'As fotos podem ter a nossa arte?',
  'home.faq.design.a':
    'Sim. Envie um fundo para a festa &mdash; horizontal, 3:2, de prefer&ecirc;ncia 1800&times;1200 &mdash; e ele fica atr&aacute;s das fotos em todas as impress&otilde;es.',

  'home.closing.heading': 'Fa&ccedil;a uma neste fim de semana',
  'home.closing.body':
    'Entre com o seu e-mail. N&atilde;o h&aacute; senha para inventar nem nada para instalar.',
  'home.closing.cta': 'Come&ccedil;ar',

  // --- the setup guide ---------------------------------------------------

  'setup.title': 'Como montar a cabine &mdash; Lumina',
  'setup.description':
    'Passo a passo: o kit alugado da impressora, o celular no trip&eacute; e o c&oacute;digo na mesa.',
  'setup.heading': 'Como montar a cabine',
  'setup.lede':
    'Do kit nas suas m&atilde;os at&eacute; a primeira foto impressa. Reserve uns quinze minutos e fa&ccedil;a isso no local da festa, no wifi que voc&ecirc; vai usar no dia.',

  'setup.kit.heading': 'O que vem no kit',
  'setup.kit.intro': 'O kit &eacute; alugado com a Lumina, em Londres. Ele traz tr&ecirc;s coisas:',
  'setup.kit.selphy':
    '<strong>Uma Canon SELPHY</strong> &mdash; a impressora de fotos. &Eacute; ela que faz as fotos 10&times;15.',
  'setup.kit.pi':
    '<strong>Um Raspberry Pi</strong> &mdash; a caixinha ligada &agrave; impressora. Ele busca cada foto e entrega para a SELPHY. N&atilde;o tem tela nem bot&otilde;es que voc&ecirc; precise usar.',
  'setup.kit.tripod':
    '<strong>Um trip&eacute;</strong> &mdash; para segurar o celular da cabine deitado.',
  'setup.kit.card':
    'Na caixa h&aacute; um cart&atilde;o com um QR code e um nome de tr&ecirc;s palavras, algo como <em>popcorn-sherbet-dance</em>. Voc&ecirc; vai precisar dos dois.',

  'setup.bring.heading': 'O que voc&ecirc; traz',
  'setup.bring.phone': '<strong>Um celular</strong> para ser a cabine, e o carregador dele.',
  'setup.bring.wifi': '<strong>O nome e a senha do wifi</strong> do local.',
  'setup.bring.own': '<strong>O seu pr&oacute;prio celular</strong>, para fazer a configura&ccedil;&atilde;o.',

  'setup.steps.heading': 'Passo a passo',
  'setup.steps.1.title': 'Crie a festa no app',
  'setup.steps.1.body': `No seu celular, abra <a href="${APP}">o app</a>, entre com o seu e-mail e toque em <em>Novo evento</em>. D&ecirc; um nome e uma data.`,
  'setup.steps.2.title': 'Ligue o kit',
  'setup.steps.2.body':
    'Ligue o Pi e a SELPHY na tomada, confira se o cabo entre os dois est&aacute; conectado e ligue a impressora. Veja se ela est&aacute; com papel e tinta. D&ecirc; um ou dois minutos para o Pi iniciar.',
  'setup.steps.3.title': 'Gere um c&oacute;digo de pareamento',
  'setup.steps.3.body':
    'No seu evento, em <em>Cabine e impressora</em>, toque em <em>Conectar impressora</em> e depois em <em>Configurar uma impressora nova</em>. O app mostra um c&oacute;digo de pareamento. Ele vale por 15 minutos e funciona uma vez; toque nele para copiar.',
  'setup.steps.4.title': 'Entre na rede da pr&oacute;pria impressora',
  'setup.steps.4.body':
    'Nos ajustes de wifi do celular, entre na rede com o nome de tr&ecirc;s palavras que est&aacute; no cart&atilde;o. Ela n&atilde;o tem senha. &Eacute; uma rede tempor&aacute;ria que o Pi cria s&oacute; para a configura&ccedil;&atilde;o.',
  'setup.steps.5.title': 'Escaneie o cart&atilde;o',
  'setup.steps.5.body':
    'Escaneie o QR code do cart&atilde;o, ou digite <strong>lumina.local</strong> no navegador. Escolha o wifi do local, digite a senha e cole o c&oacute;digo de pareamento.',
  'setup.steps.6.title': 'Veja a rede de configura&ccedil;&atilde;o sumir',
  'setup.steps.6.body':
    'O Pi entra no wifi do local e a rede dele desaparece. &Eacute; assim que voc&ecirc; sabe que deu certo. O seu celular volta para o wifi de sempre e a impressora aparece como conectada no seu evento.',
  'setup.steps.7.title': 'Coloque o celular da cabine no trip&eacute;',
  'setup.steps.7.body':
    'Deitado &mdash; a cabine tira fotos na horizontal. Deixe-o carregando. Abra o app nele, entre na conta, abra o evento e toque em <em>Usar este celular como cabine</em>. Deixe essa tela aberta. <a href="{{base}}/install/">Salvar o app na tela de in&iacute;cio</a> antes deixa tudo em tela cheia.',
  'setup.steps.8.title': 'Comece o evento e tire uma foto de teste',
  'setup.steps.8.body':
    'Toque em <em>Come&ccedil;ar o evento</em>, depois toque na tela da cabine e fa&ccedil;a pose. Tr&ecirc;s fotos e, cerca de um minuto depois, uma impress&atilde;o. Se ela saiu, est&aacute; pronto.',
  'setup.steps.9.title': 'Deixe o QR code na mesa',
  'setup.steps.9.body':
    'Imprima o <em>QR code dos convidados</em> do seu evento e deixe onde as pessoas vejam. Os convidados escaneiam para entrar na fila pelo pr&oacute;prio celular; ele tamb&eacute;m aparece na tela da cabine.',

  'setup.help.heading': 'Se algo n&atilde;o funcionar',
  'setup.help.network.q': 'N&atilde;o encontro a rede de tr&ecirc;s palavras',
  'setup.help.network.a':
    'D&ecirc; uns dois minutos ao Pi depois de ligar na tomada e procure de novo. Se ainda n&atilde;o aparecer, tire o Pi da tomada, ligue de novo e espere.',
  'setup.help.local.q': 'lumina.local n&atilde;o abre',
  'setup.help.local.a':
    'O seu celular provavelmente voltou para outra rede. Confira nos ajustes de wifi se ele ainda est&aacute; na rede de tr&ecirc;s palavras e tente de novo.',
  'setup.help.expired.q': 'Diz que o c&oacute;digo expirou',
  'setup.help.expired.a':
    'Os c&oacute;digos valem por 15 minutos e funcionam uma vez. Volte ao app, gere um novo e use esse.',
  'setup.help.back.q': 'A rede de configura&ccedil;&atilde;o voltou',
  'setup.help.back.a':
    'O Pi n&atilde;o conseguiu entrar no wifi, quase sempre por causa de uma senha digitada errado. Entre de novo na rede de tr&ecirc;s palavras e repita a partir do passo 3, com um c&oacute;digo novo.',
  'setup.help.noprint.q': 'A foto foi tirada, mas nada foi impresso',
  'setup.help.noprint.a':
    'Olhe a impressora no seu evento: ela mostra o que a pr&oacute;pria impressora est&aacute; informando. Normalmente &eacute; papel, tinta ou a impressora desligada. Resolva isso e imprima a foto de novo pelo evento.',
  'setup.help.else.q': 'Nada disso resolveu',
  'setup.help.else.a':
    '<a href="{{wa.ask}}" target="_blank" rel="noopener">Mande uma mensagem no WhatsApp</a> contando o que voc&ecirc; est&aacute; vendo.',

  // --- save to home screen -----------------------------------------------

  'install.title': 'Salve a Lumina na Tela de In&iacute;cio',
  'install.description':
    'Como adicionar a Lumina &agrave; tela de in&iacute;cio no iPhone e no Android, para abrir em tela cheia como um app.',
  'install.heading': 'Salve a Lumina na Tela de In&iacute;cio',
  'install.lede':
    'A Lumina roda no navegador, ent&atilde;o n&atilde;o h&aacute; nada na App Store. Salvar na tela de in&iacute;cio cria um &iacute;cone e abre em tela cheia, sem a barra de endere&ccedil;o &mdash; vale a pena no celular que vai ser a cabine.',
  'install.open': `Acesse <a href="${APP}">luminabooth-app.web.app</a>.`,

  'install.ios.heading': 'No iPhone ou iPad',
  'install.ios.1.title': 'Abra o app no Safari',
  'install.ios.2.title': 'Toque em Compartilhar',
  'install.ios.2.body': 'O quadrado com uma seta para cima, na barra do Safari.',
  'install.ios.3.title': 'Toque em <em>Adicionar &agrave; Tela de In&iacute;cio</em>',
  'install.ios.3.body':
    'Role a lista para baixo se n&atilde;o aparecer de cara. Depois toque em <em>Adicionar</em>.',
  'install.ios.4.title': 'Abra a Lumina pelo &iacute;cone',
  'install.ios.4.body':
    'Na primeira vez, voc&ecirc; vai precisar entrar na conta de novo, mesmo que j&aacute; estivesse conectado no Safari. Depois disso ela lembra de voc&ecirc;.',

  'install.android.heading': 'No Android',
  'install.android.1.title': 'Abra o app no Chrome',
  'install.android.2.title': 'Abra o menu',
  'install.android.2.body': 'Os tr&ecirc;s pontinhos no canto superior direito.',
  'install.android.3.title': 'Toque em <em>Adicionar &agrave; tela inicial</em>',
  'install.android.3.body':
    'Em alguns celulares aparece <em>Instalar app</em>. Confirme, e o &iacute;cone aparece junto dos seus outros apps.',

  'install.next.heading': 'A seguir: monte a cabine',
  'install.next.body': 'A impressora, o trip&eacute; e o c&oacute;digo na mesa, em ordem.',

  // --- privacy -----------------------------------------------------------

  'privacy.title': 'Pol&iacute;tica de privacidade &mdash; Lumina',
  'privacy.description':
    'O que a Lumina guarda sobre anfitri&otilde;es e convidados, onde fica armazenado e quando &eacute; apagado.',
  'privacy.heading': 'Pol&iacute;tica de privacidade',
  'privacy.lede':
    'O que guardamos, por qu&ecirc;, onde fica e quando &eacute; apagado. Escrita para ser lida, n&atilde;o para ser pulada.',
  'privacy.body': `
          <h2>Em resumo</h2>
          <ul>
            <li>Convidados n&atilde;o precisam de conta e nunca pedimos o nome deles.</li>
            <li>As fotos s&atilde;o apagadas automaticamente 90 dias depois da festa.</li>
            <li>Qualquer pessoa pode apagar a pr&oacute;pria foto antes disso.</li>
            <li>N&atilde;o h&aacute; publicidade nem rastreamento, nem aqui nem no app.</li>
            <li>N&atilde;o vendemos nada do que guardamos e n&atilde;o usamos as fotos para nada al&eacute;m de entreg&aacute;-las a quem aparece nelas.</li>
          </ul>

          <h2>Quem somos</h2>
          <p>
            A Lumina &eacute; um servi&ccedil;o de cabine de fotos operado a partir de
            Londres, no Reino Unido. Para as informa&ccedil;&otilde;es descritas aqui,
            somos o &ldquo;controlador&rdquo; nos termos da lei brit&acirc;nica de
            prote&ccedil;&atilde;o de dados. O jeito mais r&aacute;pido de falar com a
            gente sobre qualquer ponto &eacute; pelo
            <a href="{{wa.ask}}" target="_blank" rel="noopener">WhatsApp</a>.
          </p>

          <h2>Se voc&ecirc; &eacute; convidado de uma festa</h2>
          <p>
            <strong>Suas fotos.</strong> A cabine tira tr&ecirc;s fotos e junta as
            tr&ecirc;s em uma imagem s&oacute;. Guardamos as duas coisas: as tr&ecirc;s
            fotos separadas por 30 dias, e a imagem final at&eacute; 90 dias depois da
            data da festa. Depois disso, s&atilde;o apagadas automaticamente.
          </p>
          <p>
            <strong>Seu link.</strong> Cada imagem tem a sua p&aacute;gina, em um
            endere&ccedil;o longo e aleat&oacute;rio. Quem tiver o link consegue abrir,
            ent&atilde;o compartilhe-o como compartilharia a pr&oacute;pria foto. Essas
            p&aacute;ginas s&atilde;o marcadas para n&atilde;o aparecerem em buscadores.
          </p>
          <p>
            <strong>Seu e-mail, s&oacute; se voc&ecirc; informar.</strong> Se voc&ecirc;
            pedir que uma foto seja enviada por e-mail, usamos o endere&ccedil;o para
            enviar e guardamos um registro de para onde ela foi, para que o anfitri&atilde;o
            possa ver se chegou. N&atilde;o usamos para mais nada.
          </p>
          <p>
            <strong>Seu lugar na fila.</strong> Quando voc&ecirc; escaneia o c&oacute;digo,
            o seu celular guarda um pequeno identificador no armazenamento do navegador,
            para a cabine saber qual &eacute; a sua vez e qual foto voc&ecirc; pode apagar.
            Ele identifica a visita, n&atilde;o voc&ecirc;.
          </p>
          <p>
            <strong>Apagar.</strong> Voc&ecirc; pode apagar a sua foto na cabine logo
            depois de tirada, ou mais tarde pela p&aacute;gina que o seu link abre. O
            anfitri&atilde;o tamb&eacute;m pode apagar. Se perdeu o link, fale com a gente
            ou com o anfitri&atilde;o.
          </p>

          <h2>Se voc&ecirc; &eacute; o anfitri&atilde;o</h2>
          <p>
            <strong>Sua conta.</strong> Seu e-mail, e um nome se voc&ecirc; informar.
            Voc&ecirc; entra com um c&oacute;digo de seis d&iacute;gitos que enviamos por
            e-mail; n&atilde;o h&aacute; senha. Guardamos o c&oacute;digo apenas de forma
            embaralhada, e ele expira em dez minutos.
          </p>
          <p>
            <strong>Seus eventos.</strong> O nome e a data de cada festa, as artes que
            voc&ecirc; enviar, as fotos tiradas nela, o que foi impresso e os e-mails de
            quem voc&ecirc; convidar para ajudar.
          </p>
          <p>
            <strong>Seus aparelhos.</strong> Qual celular est&aacute; servindo de cabine e
            qual impressora est&aacute; conectada, e quando cada um foi visto pela
            &uacute;ltima vez, para que a tela do evento avise se algum caiu.
          </p>
          <p>
            <strong>E-mails nossos.</strong> C&oacute;digos de acesso, e um aviso 14 dias e
            3 dias antes de as fotos de uma festa serem apagadas, com um link para
            baix&aacute;-las. Nada al&eacute;m disso.
          </p>

          <h2>Se voc&ecirc; nos manda mensagem</h2>
          <p>
            As mensagens enviadas pelos bot&otilde;es deste site passam pelo WhatsApp, que
            as trata de acordo com os pr&oacute;prios termos e pol&iacute;tica de
            privacidade. N&oacute;s vemos o seu n&uacute;mero, o seu nome no WhatsApp e o
            que voc&ecirc; escrever, e usamos isso apenas para responder.
          </p>

          <h2>Cookies e armazenamento</h2>
          <p>
            Estas p&aacute;ginas n&atilde;o criam cookies e n&atilde;o carregam nada de
            terceiros. O app mant&eacute;m voc&ecirc; conectado usando o armazenamento do
            pr&oacute;prio navegador, e a p&aacute;gina do convidado guarda o identificador
            de fila descrito acima. Nenhum dos dois serve para seguir voc&ecirc; em lugar
            algum.
          </p>

          <h2>Quem mais lida com os dados</h2>
          <p>Usamos tr&ecirc;s empresas para operar o servi&ccedil;o. Elas agem sob nossas instru&ccedil;&otilde;es:</p>
          <ul>
            <li><strong>Google Cloud</strong> &mdash; roda o servi&ccedil;o e armazena as fotos, em Londres.</li>
            <li><strong>Neon</strong> &mdash; o banco de dados, tamb&eacute;m em Londres.</li>
            <li>
              <strong>Resend</strong> &mdash; envia nossos e-mails. Fica nos Estados
              Unidos, ent&atilde;o o endere&ccedil;o de e-mail para o qual enviamos &eacute;
              processado l&aacute;, com as salvaguardas que a lei brit&acirc;nica exige
              para isso.
            </li>
          </ul>
          <p>N&atilde;o compartilhamos nada com mais ningu&eacute;m, a n&atilde;o ser que a lei nos obrigue.</p>

          <h2>Por que podemos fazer isso</h2>
          <p>
            No caso dos anfitri&otilde;es, porque n&atilde;o h&aacute; como prestar o
            servi&ccedil;o contratado sem esses dados. No caso dos convidados, porque tirar
            e entregar a foto &eacute; o motivo de voc&ecirc; ter ido at&eacute; a cabine,
            e n&atilde;o a guardamos por mais tempo do que ela &eacute; &uacute;til. Quando
            enviamos uma foto por e-mail, porque voc&ecirc; pediu.
          </p>

          <h2>Crian&ccedil;as</h2>
          <p>
            Festas t&ecirc;m crian&ccedil;as. A cabine n&atilde;o pergunta quem est&aacute;
            na foto, e n&atilde;o fazemos nenhum uso das fotos al&eacute;m de
            guard&aacute;-las e mostr&aacute;-las. Cabe ao anfitri&atilde;o garantir que
            os adultos respons&aacute;veis pelas crian&ccedil;as estejam de acordo com as
            fotos. Pai, m&atilde;e ou respons&aacute;vel pode pedir, a qualquer momento,
            que apaguemos uma foto da crian&ccedil;a.
          </p>

          <h2>Seus direitos</h2>
          <p>
            Voc&ecirc; pode pedir uma c&oacute;pia do que guardamos sobre voc&ecirc;, pedir
            corre&ccedil;&atilde;o ou exclus&atilde;o, e se opor ao uso que fazemos. Mande
            uma mensagem e resolvemos em at&eacute; um m&ecirc;s. Se n&atilde;o ficar
            satisfeito com a resposta, voc&ecirc; pode reclamar ao Information
            Commissioner&rsquo;s Office, a autoridade brit&acirc;nica de prote&ccedil;&atilde;o
            de dados, em <a href="https://ico.org.uk" rel="noopener">ico.org.uk</a>.
          </p>

          <h2>Altera&ccedil;&otilde;es</h2>
          <p>
            Se esta pol&iacute;tica mudar de forma relevante, avisaremos aqui e
            atualizaremos a data no topo. Os anfitri&otilde;es tamb&eacute;m ser&atilde;o
            avisados por e-mail.
          </p>

          <p class="fine">
            Esta &eacute; uma tradu&ccedil;&atilde;o. Em caso de diverg&ecirc;ncia, vale a
            <a href="/privacy/" lang="en-GB" hreflang="en-GB">vers&atilde;o em ingl&ecirc;s</a>.
          </p>`,

  // --- terms -------------------------------------------------------------

  'terms.title': 'Termos de uso &mdash; Lumina',
  'terms.description':
    'Os termos para usar o app da Lumina e alugar o kit da cabine de fotos.',
  'terms.heading': 'Termos de uso',
  'terms.lede':
    'O que voc&ecirc; pode esperar de n&oacute;s e o que pedimos de voc&ecirc;. Usar a Lumina significa concordar com estes termos.',
  'terms.body': `
          <h2>O que &eacute; a Lumina</h2>
          <p>
            A Lumina &eacute; um software que transforma um celular em cabine de fotos, e
            um kit &mdash; uma impressora, o pequeno computador que faz ela funcionar e um
            trip&eacute; &mdash; que alugamos em Londres. Estes termos valem para os dois.
            &ldquo;N&oacute;s&rdquo; &eacute; a Lumina, operada a partir de Londres, Reino
            Unido.
          </p>

          <h2>Sua conta</h2>
          <p>
            Voc&ecirc; precisa de um e-mail para ser anfitri&atilde;o de uma festa.
            Voc&ecirc; &eacute; respons&aacute;vel pelo que acontece na sua conta,
            inclusive pelo que fizerem as pessoas que voc&ecirc; convidar para ajudar.
            Convidados n&atilde;o precisam de conta.
          </p>

          <h2>O que pedimos dos anfitri&otilde;es</h2>
          <ul>
            <li>Avise os convidados de que h&aacute; uma cabine de fotos, e de que as fotos ficam guardadas e podem ser apagadas.</li>
            <li>Havendo crian&ccedil;as, garanta que os adultos respons&aacute;veis por elas estejam de acordo com as fotos.</li>
            <li>Envie apenas artes que voc&ecirc; tenha o direito de usar.</li>
            <li>N&atilde;o use a Lumina para nada ilegal, nem para fotografar quem n&atilde;o concordou.</li>
          </ul>

          <h2>As fotos</h2>
          <p>
            As fotos pertencem a quem as tirou e a quem aparece nelas, n&atilde;o a
            n&oacute;s. N&oacute;s as guardamos para que possam ser impressas,
            compartilhadas e baixadas, e para nada mais. Elas s&atilde;o apagadas 90 dias
            depois da data da festa, e depois disso n&atilde;o temos como recuper&aacute;-las
            &mdash; baixe o que quiser guardar. Os detalhes est&atilde;o na
            <a href="{{base}}/privacy/">pol&iacute;tica de privacidade</a>.
          </p>
          <p>
            Podemos remover uma foto ou encerrar uma conta que descumpra estes termos ou a
            lei.
          </p>

          <h2>Pre&ccedil;o</h2>
          <p>
            O app &eacute; gratuito enquanto &eacute; novidade. Se isso mudar, avisaremos
            antes, e nada do que voc&ecirc; j&aacute; fez ser&aacute; cobrado depois.
          </p>

          <h2>Aluguel do kit</h2>
          <p>
            O aluguel &eacute; combinado por mensagem. Antes de voc&ecirc; fechar,
            informaremos por escrito o pre&ccedil;o, as datas, como o kit chega at&eacute;
            voc&ecirc; e volta, e o que est&aacute; inclu&iacute;do. Essa mensagem, junto
            com esta se&ccedil;&atilde;o, &eacute; o contrato daquele aluguel.
          </p>
          <ul>
            <li>O kit continua sendo nosso. Devolva-o, na data combinada, como chegou.</li>
            <li>Voc&ecirc; &eacute; respons&aacute;vel por ele enquanto estiver com voc&ecirc;. Se voltar danificado ou n&atilde;o voltar, podemos cobrar o custo do conserto ou da reposi&ccedil;&atilde;o.</li>
            <li>Use em ambiente interno, mantenha seco e n&atilde;o abra a impressora nem a caixa ao lado dela.</li>
            <li>Se o kit chegar com defeito, avise na hora e n&oacute;s resolvemos ou devolvemos o valor do aluguel.</li>
          </ul>

          <h2>O que n&atilde;o podemos prometer</h2>
          <p>
            A Lumina depende de coisas que n&atilde;o controlamos: o wifi do local, a
            energia, a c&acirc;mera e a bateria de um celular. Trabalhamos para manter o
            servi&ccedil;o no ar e ajudamos se algo der errado no dia, mas n&atilde;o
            podemos prometer que ele nunca ser&aacute; interrompido, e n&atilde;o somos
            respons&aacute;veis por uma festa que n&atilde;o saiu como planejado por causa
            disso.
          </p>
          <p>
            Se a falha for nossa, o que devemos a voc&ecirc; se limita ao que voc&ecirc;
            nos pagou pelo aluguel em quest&atilde;o. Nada aqui limita a nossa
            responsabilidade por morte ou les&atilde;o causada por neglig&ecirc;ncia
            nossa, por fraude, ou por qualquer outra coisa que a lei n&atilde;o permita
            limitar. Se voc&ecirc; &eacute; consumidor, os seus direitos legais n&atilde;o
            s&atilde;o afetados.
          </p>

          <h2>Encerramento</h2>
          <p>
            Voc&ecirc; pode parar de usar a Lumina quando quiser, e pedir que apaguemos a
            sua conta e tudo o que h&aacute; nela. Podemos suspender ou encerrar uma conta
            que descumpra estes termos.
          </p>

          <h2>Altera&ccedil;&otilde;es</h2>
          <p>
            Podemos atualizar estes termos. Se a mudan&ccedil;a for relevante, avisaremos
            os anfitri&otilde;es por e-mail antes de ela valer e atualizaremos a data no
            topo.
          </p>

          <h2>Lei aplic&aacute;vel</h2>
          <p>
            Estes termos s&atilde;o regidos pela lei da Inglaterra e do Pa&iacute;s de
            Gales, e cabe aos tribunais de l&aacute; decidir qualquer disputa sobre eles.
            Se voc&ecirc; mora em outra parte do Reino Unido, tamb&eacute;m pode entrar
            com a a&ccedil;&atilde;o onde mora.
          </p>

          <h2>Contato</h2>
          <p>
            <a href="{{wa.ask}}" target="_blank" rel="noopener">Mande uma mensagem no WhatsApp</a>.
          </p>

          <p class="fine">
            Esta &eacute; uma tradu&ccedil;&atilde;o. Em caso de diverg&ecirc;ncia, vale a
            <a href="/terms/" lang="en-GB" hreflang="en-GB">vers&atilde;o em ingl&ecirc;s</a>.
          </p>`,
}
