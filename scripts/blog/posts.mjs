const networks = ['facebook', 'instagram', 'google'];
const expected = {
  facebook: ['text', 'url'],
  instagram: ['text', 'image'],
  google: ['text', 'url', 'image', 'topicType', 'actionType'],
};
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) {
    throw Error(`posts.json : structure invalide (${label})`);
  }
}
export function validatePosts(posts, slug) {
  object(posts, networks, 'réseaux');
  const url = `https://efficiadigital.com/blog/${slug}`;
  for (const network of networks) {
    const post = posts[network]; object(post, expected[network], network);
    for (const value of Object.values(post)) if (typeof value !== 'string' || !value.trim()) throw Error(`posts.json : chaîne requise (${network})`);
    const text = post.text, length = [...text].length;
    if (/[!！]|\p{Extended_Pictographic}/u.test(text)
        || /\bgaranti(?:e|es|s)?\b|explosez|n[°º]\s*1|SEO local|taux de conversion/iu.test(text)) throw Error(`posts.json : charte (${network})`);
    for (const m of text.matchAll(/([0-9][0-9 \u00a0\u202f]*(?:[,.][0-9]+)?)\s*€(?![\s\u00a0]+TTC\b)/gu)) {
      if (Number(m[1].replace(/[ \u00a0\u202f]/g,'').replace(',','.')) !== 0) throw Error(`posts.json : TTC obligatoire (${network})`);
    }
    if (network === 'facebook' && (length < 400 || length > 700 || post.url !== url)) throw Error('posts.json : longueur ou URL Facebook');
    if (network === 'instagram') {
      const tags = text.match(/#[\p{L}\p{N}_]+/gu) || [];
      if (length < 600 || length > 1200 || tags.length < 3 || tags.length > 5
          || /https?:|www\./i.test(text) || !text.trimEnd().endsWith('Lien dans la bio')
          || post.image !== `${slug}-instagram.jpg`) throw Error('posts.json : texte ou image Instagram');
    }
    if (network === 'google') {
      const words = (text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []).length;
      if (words < 150 || words > 300 || /(?:\+\d|0\d)(?:[\s().-]*\d){7,}/.test(text)
          || post.url !== url || post.image !== `${slug}-google.jpg`
          || post.topicType !== 'STANDARD' || post.actionType !== 'LEARN_MORE') throw Error('posts.json : texte, image ou action Google');
    }
  }
  return posts;
}
