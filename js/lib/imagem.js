/**
 * Envio de imagens sem servidor de arquivos.
 *
 * POR QUE ASSIM
 * O Firebase Storage resolveria isto com uma linha, mas é serviço pago por
 * volume e exige configuração à parte. Para uma logo e uma foto de rosto —
 * imagens minúsculas, uma por barbearia e uma por barbeiro — a solução
 * honesta é redimensionar no próprio navegador e guardar a imagem dentro
 * do documento do Firestore como data URI.
 *
 * O TETO QUE MANDA
 * Um documento do Firestore não pode passar de 1 MiB, e base64 infla o
 * arquivo em cerca de 33%. Por isso nada aqui é enviado como veio: a
 * imagem é reduzida, convertida para WebP e, se ainda estiver grande, a
 * qualidade cai em degraus até caber com folga. Enviar o original seria
 * quebrar a gravação para quem escolhesse uma foto de celular moderno.
 *
 * QUANDO TROCAR
 * Se um dia entrarem galerias de fotos de corte, isto não serve mais —
 * aí é Storage de verdade. Para marca e avatar, serve bem.
 */

/** Teto por imagem, já em base64. Bem abaixo do limite do documento. */
const LIMITE_BYTES = 120 * 1024;

const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

export const PERFIL_LOGO = {
  maxLargura: 480,
  maxAltura: 240,
  quadrado: false,
  rotulo: "logo",
};

export const PERFIL_FOTO = {
  maxLargura: 256,
  maxAltura: 256,
  quadrado: true,
  rotulo: "foto",
};

/**
 * Lê o arquivo escolhido e devolve um data URI pronto para gravar.
 * Lança Error com mensagem em português quando algo não serve.
 */
export async function prepararImagem(arquivo, perfil = PERFIL_LOGO) {
  if (!arquivo) throw new Error("Nenhum arquivo escolhido.");

  if (!TIPOS_ACEITOS.includes(arquivo.type)) {
    throw new Error("Formato não aceito. Use PNG, JPG ou WebP.");
  }

  // 12 MB é generoso para o original; o que importa é o resultado final
  if (arquivo.size > 12 * 1024 * 1024) {
    throw new Error("Imagem muito grande. Escolha um arquivo de até 12 MB.");
  }

  const bitmap = await carregarBitmap(arquivo);
  const { largura, altura, origem } = calcularDestino(bitmap, perfil);

  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;

  const ctx = tela.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    origem.x, origem.y, origem.largura, origem.altura,
    0, 0, largura, altura,
  );
  bitmap.close?.();

  // WebP mantém transparência (essencial para logo) e comprime melhor
  for (const qualidade of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    const uri = tela.toDataURL("image/webp", qualidade);
    if (uri.startsWith("data:image/webp") && tamanhoDe(uri) <= LIMITE_BYTES) {
      return uri;
    }
  }

  // navegador sem WebP: cai para PNG, e se não couber avisa em vez de gravar torto
  const png = tela.toDataURL("image/png");
  if (tamanhoDe(png) <= LIMITE_BYTES) return png;

  throw new Error(
    "Não consegui comprimir esta imagem o suficiente. " +
      "Tente uma versão menor ou com menos detalhes.",
  );
}

/** Tamanho aproximado, em bytes, de um data URI. */
export function tamanhoDe(dataUri) {
  const base64 = String(dataUri).split(",")[1] ?? "";
  return Math.round((base64.length * 3) / 4);
}

export function formatarTamanho(bytes) {
  return bytes < 1024
    ? `${bytes} B`
    : `${(bytes / 1024).toFixed(0)} KB`;
}

/* ------------------------------------------------------------------ */

async function carregarBitmap(arquivo) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(arquivo);
    } catch {
      // alguns formatos falham aqui; segue para o caminho do <img>
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não consegui ler esta imagem."));
    };
    img.src = url;
  });
}

/**
 * Calcula o recorte de origem e o tamanho de destino.
 * Perfil quadrado recorta pelo centro (foto de rosto vira círculo depois);
 * perfil livre só encolhe respeitando a proporção (logo não pode distorcer).
 */
function calcularDestino(bitmap, perfil) {
  const largura0 = bitmap.width;
  const altura0 = bitmap.height;

  if (perfil.quadrado) {
    const lado = Math.min(largura0, altura0);
    const destino = Math.min(perfil.maxLargura, lado);
    return {
      largura: destino,
      altura: destino,
      origem: {
        x: Math.round((largura0 - lado) / 2),
        y: Math.round((altura0 - lado) / 2),
        largura: lado,
        altura: lado,
      },
    };
  }

  const escala = Math.min(
    perfil.maxLargura / largura0,
    perfil.maxAltura / altura0,
    1, // nunca ampliar: esticar não cria detalhe, só borra
  );

  return {
    largura: Math.max(1, Math.round(largura0 * escala)),
    altura: Math.max(1, Math.round(altura0 * escala)),
    origem: { x: 0, y: 0, largura: largura0, altura: altura0 },
  };
}
