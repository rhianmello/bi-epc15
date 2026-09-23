# BI EPC-15

Dashboard executivo estático para leitura do acompanhamento físico do contrato EPC-15. O sistema processa o Excel localmente no navegador, identifica as unidades e transforma os dados em visão executiva, páginas por unidade, análises e slides HTML.

## Como abrir

1. Baixe ou clone o repositório.
2. Abra `index.html` no Chrome ou Edge atualizado.
3. Clique em **Selecionar Excel**.
4. Escolha o arquivo oficial de acompanhamento em `.xlsb`, `.xlsx` ou `.xlsm`.

Também é possível publicar o conteúdo diretamente no GitHub Pages, pois todos os caminhos são relativos e não há backend.

## Fonte e processamento dos dados

- Aba obrigatória: `Avanço PLATAQ`.
- Aba complementar: `PPT_RESUMO`.
- O arquivo selecionado não é enviado para servidor, API ou banco de dados.
- A leitura é feita na memória do navegador.
- A aplicação detecta automaticamente as unidades consolidadas de nível 1.
- Os resumos usam o primeiro bloco hierárquico da aba `Avanço PLATAQ`, organizado por unidade.
- O segundo bloco hierárquico, que reorganiza o contrato por disciplina, é ignorado nos totais para evitar dupla contagem.
- O detalhamento mostra linhas-folha da hierarquia.

> O Excel precisa ter sido recalculado e salvo antes de ser carregado no BI. A aplicação lê os valores já gravados no arquivo e não recria todas as fórmulas do Excel.

## Funcionalidades da V1

- leitura de `.xlsb`, `.xlsx` e `.xlsm`;
- validação de formato, workbook, aba e colunas mínimas;
- cards do contrato e das unidades;
- previsto, realizado e desvio em pontos percentuais;
- resumo e rankings das unidades;
- gráficos por unidade e por fase;
- filtros e pesquisa no detalhamento;
- status centralizados em configuração;
- modo apresentação 16:9 com um resumo e um slide por unidade;
- navegação por botões, setas do teclado e tela cheia;
- exportação dos slides para PDF;
- layout responsivo e otimizado para 1920 × 1080.

## Estrutura

```text
index.html
css/style.css
js/config.js
js/excel-reader.js
js/data-model.js
js/charts.js
js/dashboard.js
js/presentation.js
js/export.js
js/app.js
vendor/
```

As bibliotecas usadas na leitura do Excel, nos gráficos e na exportação PDF estão versionadas em `vendor/`, permitindo abrir o painel sem instalar dependências.

## Limitações da V1

- não gera PowerPoint `.pptx`;
- não possui backend, login, histórico ou sincronização;
- não cria Curva S histórica;
- não compara versões ou datas-base diferentes;
- não recalcula fórmulas do Excel;
- limita a renderização simultânea do detalhamento a 750 linhas filtradas para preservar desempenho;
- depende da manutenção da estrutura mínima da aba `Avanço PLATAQ`.

## Segurança

Planilhas, CSVs, arquivos de ambiente e logs estão bloqueados no `.gitignore`. Não inclua o Excel oficial no repositório.


## BI Rundown

O arquivo `rundown.html` contém o painel de rundown desenvolvido para leitura local das abas:

- `20_Planejamento-curvas_rundown`;
- `21_Planejamento-curvas_S_Física`.

O painel cruza as atividades pelo ID Primavera, exibe produção semanal e curvas de saldo restante, monta a Rundown consolidada, permite busca direta por ID e exportação dos gráficos em PNG/PDF.
