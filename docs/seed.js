/* =========================================================
   MOAI 初期テンプレートデータ
   - ブラウザ版（サーバーなし）では localStorage の初期値になる
   - ローカル版では server.js が data/*.json を作るときの雛形になる
   ここを書き換えれば、自分用の初期設定にできます。
   ========================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MOAI_SEED = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    config: {
      appName: 'MOAI',
      appNameJa: 'AIマーケティング司令室',
      version: '1.1.0',
      brand: {
        mission: '（ここに「何のためにメディアを運用するのか」を書いてください。AIへの指示に毎回引き継がれます）',
        tone: 'ですます調・具体的な数字と事例を必ず含める・煽らない',
        ngWords: ['絶対に稼げる', '誰でも簡単に', '確実に'],
        rules: [
          '使っていない商品を「実際に使った」と書かない（景表法・ステマ規制）',
          '架空の著者プロフィールや資格を作らない',
          '引用元・参照URLは必ず記録する',
          '他社記事の翻訳・要約ではなく、独自の観点で再構成する',
        ],
      },
      goals: {
        monthlyRevenueTargetJpy: 0,
        quarterGoal: '（3ヶ月後の目標を書いてください）',
      },
      settings: { autoApprove: false, timezone: 'Asia/Tokyo' },
    },

    channels: {
      items: [
        {
          id: 'ch_blog', name: 'ブログ / オウンドメディア', type: 'blog', url: '',
          status: 'active', followers: 0, goal: 0, cadence: '週2記事',
          skill: '', monetization: 'アフィリエイト / 広告',
          note: '検索流入が主軸。E-E-A-T（実体験・専門性・権威性・信頼性）を満たす記事を書く',
          isSample: true,
        },
        {
          id: 'ch_instagram', name: 'Instagram', type: 'instagram', url: '',
          status: 'active', followers: 0, goal: 5000, cadence: '毎日1投稿',
          skill: '', monetization: 'プロフィールリンク経由',
          note: 'Reelsは他形式の約3倍リーチ。フォロワー1万でストーリーリンクが解放される',
          isSample: true,
        },
        {
          id: 'ch_x', name: 'X（旧Twitter）', type: 'x', url: '',
          status: 'active', followers: 0, goal: 3000, cadence: '1日2〜3投稿',
          skill: '', monetization: '外部への送客',
          note: '本文に直リンクを貼るとリーチが落ちる。リンクは自分への返信で貼る',
          isSample: true,
        },
        {
          id: 'ch_youtube', name: 'YouTube', type: 'youtube', url: '',
          status: 'paused', followers: 0, goal: 1000, cadence: '週1本',
          skill: '', monetization: '広告収益 / 概要欄リンク',
          note: '登録者1,000人＋再生4,000時間で収益化。Shortsは入口として有効',
          isSample: true,
        },
      ],
    },

    agents: {
      items: [
        {
          id: 'ag_strategist', name: '戦略ディレクター', role: 'strategy', avatar: '🧭',
          desc: '全チャネルのKPIを見て今週の優先順位を決め、他のエージェントに仕事を割り振る',
          backend: { type: 'main', target: 'メインスレッド' },
          outputs: ['週次戦略', '優先タスク一覧'], enabled: true,
        },
        {
          id: 'ag_seo', name: 'SEOリサーチャー', role: 'research', avatar: '🔍',
          desc: '検索需要のあるキーワード・競合の強さ・勝てる切り口を調べる',
          backend: { type: 'agent', target: 'moai-seo-researcher' },
          outputs: ['キーワード候補', '競合の強さ', '記事の切り口'], enabled: true,
        },
        {
          id: 'ag_writer', name: 'コンテンツライター', role: 'content', avatar: '📝',
          desc: 'リサーチ結果をもとに、公開できる状態の記事本文を書く',
          backend: { type: 'agent', target: 'moai-content-writer' },
          outputs: ['記事本文', 'タイトル案', '見出し構成'], enabled: true,
        },
        {
          id: 'ag_social', name: 'SNSコピーライター', role: 'content', avatar: '💬',
          desc: 'スクロールを止める1行目と本文を、型を変えて複数パターン作る',
          backend: { type: 'agent', target: 'moai-social-copywriter' },
          outputs: ['投稿文パターン', 'フック案', 'A/Bテスト案'], enabled: true,
        },
        {
          id: 'ag_competitor', name: '競合アナリスト', role: 'analysis', avatar: '🕵️',
          desc: '競合が「いつ・何を変えて・なぜ伸びたか」を調べ、勝ちパターンを抽出する',
          backend: { type: 'agent', target: 'moai-competitor-analyst' },
          outputs: ['競合レポート', '勝ちパターン', '差別化案'], enabled: true,
        },
        {
          id: 'ag_growth', name: 'グロース分析官', role: 'analysis', avatar: '📈',
          desc: '週次で実績を分析し、翌週やるべきことを3つに絞って提案する',
          backend: { type: 'agent', target: 'moai-growth-analyst' },
          outputs: ['週次レポート', '翌週の優先施策'], enabled: true,
        },
        {
          id: 'ag_funnel', name: '収益ファネル設計', role: 'revenue', avatar: '💰',
          desc: 'フォロワーを売上に変える導線を設計し、どこで人が落ちているかを特定する',
          backend: { type: 'agent', target: 'moai-funnel-designer' },
          outputs: ['ファネル図', 'ボトルネック', '改善案'], enabled: true,
        },
        {
          id: 'ag_video', name: '動画・Reels企画', role: 'content', avatar: '🎬',
          desc: 'ショート動画の脚本・テロップ指示・BGM方針をまとめた制作指示書を作る',
          backend: { type: 'agent', target: 'moai-video-director' },
          outputs: ['動画脚本', '編集指示書', 'サムネ案'], enabled: true,
        },
      ],
    },

    tasks: {
      items: [
        {
          id: 'tsk_sample_review',
          title: '【サンプル】ブログ記事：はじめての記事',
          channelId: 'ch_blog', agentId: 'ag_writer',
          status: 'review', priority: 'normal',
          createdAt: '', updatedAt: '',
          instruction: '検索需要のあるテーマで、読者の悩みが解決する記事を1本書いて',
          output: 'ここに AI が書いた本文が入ります。\n\n読んでから「承認する」を押すと公開待ちに移動し、\n「差し戻す」を押すと修正指示つきで書き直しになります。\n\n※これはサンプルです。設定画面から一括で削除できます。',
          meta: {}, isSample: true,
          history: [],
        },
      ],
    },

    inbox: { items: [] },

    messages: {
      items: [
        {
          id: 'msg_welcome', role: 'agent', author: 'MOAI',
          text: 'MOAI へようこそ。\n\n① 「チャネル」で運用するメディアを登録する\n② この画面で、やってほしいことを日本語で書く\n③ 積まれた指示を AI が実行し、「承認キュー」に結果が戻る\n\nまずはサンプルを触ってみてください。設定画面からいつでも消せます。',
          at: '',
        },
      ],
    },

    calendar: { items: [] },
    metrics: { items: [] },
    reports: { items: [] },
  };
});
