"""
Servidor local do Agendia — desenvolvimento apenas.

POR QUE NÃO É O `python -m http.server` PURO
O `http.server` padrão não manda cabeçalho de cache nenhum, e o navegador
então decide sozinho por quanto tempo guardar cada arquivo. Com módulos ES
isso vira armadilha: você edita um .js, recarrega, e o navegador continua
executando a versão antiga sem avisar — parece que a alteração não pegou.

Aqui todo arquivo sai com `no-store`, então cada recarga busca o arquivo do
disco. Serve só para testar em casa; no GitHub Pages quem manda no cache é
o servidor deles.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORTA_PADRAO = 8124


class SemCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, formato, *args):
        # O log de cada arquivo servido só empurra para fora da janela as
        # senhas de teste que o .bat imprime. Erros continuam aparecendo.
        codigo = args[1] if len(args) > 1 else ""
        if str(codigo).startswith(("4", "5")):
            super().log_message(formato, *args)


def main():
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else PORTA_PADRAO
    raiz = str(Path(__file__).resolve().parent)
    manipulador = partial(SemCache, directory=raiz)

    with ThreadingHTTPServer(("127.0.0.1", porta), manipulador) as servidor:
        print(f" Agendia servindo {raiz}")
        print(f" http://localhost:{porta}")
        print(" Ctrl+C ou feche a janela para parar.\n")
        try:
            servidor.serve_forever()
        except KeyboardInterrupt:
            print("\n Servidor parado.")


if __name__ == "__main__":
    main()
