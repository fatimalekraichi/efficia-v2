// Les anciens liens vers les sections Google de l'accueil (e-mails, publications, signatures)
// mènent désormais à la page Optimisation Google Business.
(() => {
  const moved = ['#diagnostic', '#offres', '#methode', '#faq', '#enjeux', '#founder-title'];
  if (moved.includes(location.hash)) location.replace('/optimisation-google-business' + location.hash);
})();
