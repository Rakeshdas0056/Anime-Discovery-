// AniList GraphQL endpoint (no API key required)
const ANILIST = "https://graphql.anilist.co";

const state = {
  page: 1,
  perPage: 18,
  lastQuery: "",
  season: "",
  format: "",
  results: [],
  hasNextPage: false,
  view: "home" // or "watchlist"
};

const els = {
  searchInput: document.getElementById("searchInput"),
  searchBtn: document.getElementById("searchBtn"),
  seasonSelect: document.getElementById("seasonSelect"),
  formatSelect: document.getElementById("formatSelect"),
  results: document.getElementById("results"),
  prevPage: document.getElementById("prevPage"),
  nextPage: document.getElementById("nextPage"),
  pageInfo: document.getElementById("pageInfo"),
  modal: document.getElementById("detailsModal"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  closeModal: document.getElementById("closeModal"),
  playerModal: document.getElementById("playerModal"),
  playerTitle: document.getElementById("playerTitle"),
  closePlayer: document.getElementById("closePlayer"),
  navHome: document.getElementById("nav-home"),
  navWatchlist: document.getElementById("nav-watchlist")
};

// Init
document.getElementById("year").textContent = new Date().getFullYear();
attachEvents();
loadFromQueryString();
renderWatchlistIfNeeded();

// --- Events ---
function attachEvents() {
  els.searchBtn.addEventListener("click", () => doSearch(true));
  els.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch(true);
  });
  els.seasonSelect.addEventListener("change", () => doSearch(true));
  els.formatSelect.addEventListener("change", () => doSearch(true));
  els.prevPage.addEventListener("click", () => changePage(-1));
  els.nextPage.addEventListener("click", () => changePage(1));
  els.closeModal.addEventListener("click", () => els.modal.close());
  els.closePlayer.addEventListener("click", () => els.playerModal.close());

  els.navHome.addEventListener("click", (e) => {
    e.preventDefault();
    state.view = "home";
    els.navHome.classList.add("active");
    els.navWatchlist.classList.remove("active");
    doSearch(false);
  });

  els.navWatchlist.addEventListener("click", (e) => {
    e.preventDefault();
    state.view = "watchlist";
    els.navWatchlist.classList.add("active");
    els.navHome.classList.remove("active");
    renderWatchlist();
  });
}

function loadFromQueryString() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q") || "";
  if (q) {
    els.searchInput.value = q;
    doSearch(true);
  } else {
    doSearch(true); // initial load popular
  }
}

function changePage(delta) {
  state.page = Math.max(1, state.page + delta);
  doSearch(false);
}

async function doSearch(resetPage = false) {
  if (state.view === "watchlist") return renderWatchlist();

  const query = els.searchInput.value.trim();
  if (resetPage) state.page = 1;

  state.lastQuery = query;
  state.season = els.seasonSelect.value || "";
  state.format = els.formatSelect.value || "";

  renderLoading();

  const variables = {
    page: state.page,
    perPage: state.perPage,
    search: query || null,
    season: state.season || null,
    format: state.format || null
  };

  const gql = `
    query ($page: Int, $perPage: Int, $search: String, $season: MediaSeason, $format: MediaFormat) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { currentPage hasNextPage }
        media(search: $search, season: $season, format: $format, type: ANIME, sort: POPULARITY_DESC) {
          id
          title { romaji english native }
          coverImage { large color }
          bannerImage
          season
          seasonYear
          format
          episodes
          status
          averageScore
          genres
          description(asHtml: false)
          trailer { id site thumbnail }
          siteUrl
        }
      }
    }
  `;

  try {
    const res = await fetch(ANILIST, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ query: gql, variables })
    });
    const data = await res.json();
    const page = data.data.Page;
    state.results = page.media || [];
    state.hasNextPage = page.pageInfo.hasNextPage;
    renderResults();
  } catch (err) {
    els.results.innerHTML = `<div class="card" style="padding:1rem">Error: ${err?.message || err}</div>`;
  }
}

function renderLoading() {
  els.results.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const d = document.createElement("div");
    d.className = "card";
    d.innerHTML = `<div class="cover"></div><div class="card-body"><div class="title">Loading…</div><div class="meta">Please wait</div></div>`;
    els.results.appendChild(d);
  }
}

function renderResults() {
  els.results.innerHTML = "";
  els.pageInfo.textContent = `Page ${state.page}`;
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = !state.hasNextPage;

  state.results.forEach((m) => {
    const card = document.createElement("div");
    card.className = "card";
    const title = m.title.english || m.title.romaji || m.title.native || "Untitled";
    const genres = (m.genres || []).slice(0,3).join(" • ");
    const cover = m.coverImage?.large || "";

    card.innerHTML = `
      <img class="cover" src="${cover}" alt="${title} cover"/>
      <div class="card-body">
        <div class="title" title="${title}">${title}</div>
        <div class="meta">
          ${m.season || ""} ${m.seasonYear || ""} • ${m.format || ""} ${m.episodes ? `• ${m.episodes} ep` : ""}
        </div>
        <div class="meta">${genres}</div>
        <div class="actions">
          <button class="btn btn-accent" data-id="${m.id}" data-action="details">Details</button>
          <button class="btn" data-id="${m.id}" data-action="watchlist">+ Watchlist</button>
          <a class="btn" href="${buildLegalSearchLink(title)}" target="_blank" rel="noopener">Where to Watch</a>
        </div>
      </div>
    `;
    card.querySelector('[data-action="details"]').addEventListener("click", () => openDetails(m));
    card.querySelector('[data-action="watchlist"]').addEventListener("click", () => addToWatchlist(m));
    els.results.appendChild(card);
  });
}

function openDetails(m) {
  const title = m.title.english || m.title.romaji || m.title.native || "Untitled";
  els.modalTitle.textContent = title;

  const trailer = m.trailer && m.trailer.site === "youtube" ? `
    <iframe class="trailer" src="https://www.youtube.com/embed/${m.trailer.id}" title="Trailer" allowfullscreen loading="lazy"></iframe>
  ` : `<div class="badge">No official trailer available</div>`;

  const genres = (m.genres || []).map(g => `<span class="badge">${g}</span>`).join("");
  const score = m.averageScore ? `<span class="badge">Score: ${m.averageScore}</span>` : "";
  const status = m.status ? `<span class="badge">Status: ${m.status}</span>` : "";
  const eps = m.episodes ? `<span class="badge">Episodes: ${m.episodes}</span>` : "";

  els.modalBody.innerHTML = `
    <div class="cols">
      <div>
        <img class="cover" src="${m.coverImage?.large || ""}" alt="${title} cover"/>
        <div class="badges" style="margin-top:.6rem">${score}${status}${eps}</div>
        <div class="badges" style="margin-top:.6rem">${genres}</div>
        <div style="margin-top:.8rem; display:flex; gap:.5rem; flex-wrap:wrap">
          <a class="btn" href="${m.siteUrl}" target="_blank" rel="noopener">AniList Page</a>
          <a class="btn" href="${buildLegalSearchLink(title)}" target="_blank" rel="noopener">Where to Watch</a>
          <button class="btn" data-action="add">+ Watchlist</button>
          <button class="btn" data-action="player">Open Official Player</button>
        </div>
      </div>
      <div>
        <p>${sanitize(m.description || "No description available.")}</p>
        <div style="margin-top:1rem">${trailer}</div>
      </div>
    </div>
  `;

  const addBtn = els.modalBody.querySelector('[data-action="add"]');
  addBtn.addEventListener("click", () => addToWatchlist(m));

  const playerBtn = els.modalBody.querySelector('[data-action="player"]');
  playerBtn.addEventListener("click", () => {
    // Only for **licensed** streams that YOU own rights to.
    els.playerTitle.textContent = `${title} • Official Player`;
    els.playerModal.showModal();
  });

  els.modal.showModal();
}

function sanitize(text) {
  // basic sanitize: remove risky tags
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function buildLegalSearchLink(title) {
  // Smart link—opens search on major legal platforms
  const q = encodeURIComponent(`${title} watch`);
  // You can replace this with a JustWatch deep link if you integrate their API/affiliate later.
  return `https://www.google.com/search?q=${q}+site%3Acrunchyroll.com+OR+site%3Anetflix.com+OR+site%3Aprimevideo.com+OR+site%3Adisneyplus.com`;
}

// --- Watchlist (localStorage) ---
function getWatchlist() {
  try { return JSON.parse(localStorage.getItem("watchlist") || "[]"); } catch { return []; }
}
function setWatchlist(list) {
  localStorage.setItem("watchlist", JSON.stringify(list));
}
function addToWatchlist(m) {
  const list = getWatchlist();
  if (!list.find(x => x.id === m.id)) {
    list.push({ id: m.id, title: m.title, coverImage: m.coverImage });
    setWatchlist(list);
    alert("Added to watchlist!");
  } else {
    alert("Already in watchlist.");
  }
}
function renderWatchlistIfNeeded() {
  if (state.view === "watchlist") renderWatchlist();
}
function renderWatchlist() {
  const list = getWatchlist();
  els.results.innerHTML = "";
  els.pageInfo.textContent = `Watchlist (${list.length})`;
  els.prevPage.disabled = true;
  els.nextPage.disabled = true;

  if (!list.length) {
    els.results.innerHTML = `<div class="card" style="padding:1rem">Your watchlist is empty.</div>`;
    return;
  }

  list.forEach(m => {
    const title = m.title.english || m.title.romaji || m.title.native || "Untitled";
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img class="cover" src="${m.coverImage?.large || ""}" alt="${title} cover"/>
      <div class="card-body">
        <div class="title">${title}</div>
        <div class="actions">
          <button class="btn" data-action="remove">Remove</button>
          <a class="btn" href="https://anilist.co/anime/${m.id}" target="_blank" rel="noopener">AniList</a>
        </div>
      </div>
    `;
    card.querySelector('[data-action="remove"]').addEventListener("click", () => {
      const updated = getWatchlist().filter(x => x.id !== m.id);
      setWatchlist(updated);
      renderWatchlist();
    });
    els.results.appendChild(card);
  });
      }
