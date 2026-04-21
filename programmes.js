(() => {
  "use strict";

  const data = window.programmesData || {};

  const recordingsGrid = document.getElementById("recordingsGrid");
  const postersGrid = document.getElementById("postersGrid");
  const upcomingGrid = document.getElementById("upcomingGrid");
  const previousTimeline = document.getElementById("previousTimeline");

  const modal = document.getElementById("mediaModal");
  const modalBody = document.getElementById("mediaModalBody");
  const modalClose = document.getElementById("mediaModalClose");

  if (!recordingsGrid || !postersGrid || !upcomingGrid || !previousTimeline || !modal || !modalBody || !modalClose) {
    return;
  }

  const recordings = Array.isArray(data.recordings) ? data.recordings : [];
  const posters = Array.isArray(data.posters) ? data.posters : [];
  const upcoming = Array.isArray(data.upcoming) ? data.upcoming : [];
  const previous = Array.isArray(data.previousTimeline) ? data.previousTimeline : [];

  function closeModal() {
    const media = modalBody.querySelector("video");
    if (media) {
      media.pause();
      media.currentTime = 0;
    }

    modalBody.innerHTML = "";
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function openImageModal(src, alt) {
    modalBody.innerHTML = "";

    const image = document.createElement("img");
    image.src = src;
    image.alt = alt || "Programme poster";

    image.addEventListener("error", () => {
      modalBody.innerHTML = "<div class=\"state-box\">Poster file not found. Check the image path in programmes-data.js.</div>";
    });

    modalBody.appendChild(image);
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function openVideoModal(src, title, posterSrc) {
    modalBody.innerHTML = "";

    const video = document.createElement("video");
    video.controls = true;
    video.preload = "metadata";
    video.setAttribute("playsinline", "playsinline");
    video.poster = posterSrc || "";

    const source = document.createElement("source");
    source.src = src;
    source.type = "video/mp4";

    video.appendChild(source);
    video.appendChild(document.createTextNode("Your browser does not support this video format."));

    video.addEventListener("error", () => {
      modalBody.innerHTML = "";
      const fallback = document.createElement("div");
      fallback.className = "state-box";
      fallback.textContent = "Video could not be loaded. Check the video file path and format.";
      modalBody.appendChild(fallback);
    });

    const titleNode = document.createElement("p");
    titleNode.className = "sr-only";
    titleNode.textContent = title || "Programme recording";

    modalBody.appendChild(titleNode);
    modalBody.appendChild(video);

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function makeEmptyState(message) {
    const node = document.createElement("div");
    node.className = "state-box";
    node.textContent = message;
    return node;
  }

  function renderRecordings() {
    recordingsGrid.innerHTML = "";

    if (!recordings.length) {
      recordingsGrid.appendChild(makeEmptyState("No recordings available yet."));
      return;
    }

    recordings.forEach((item) => {
      const card = document.createElement("article");
      card.className = "media-card reveal show";

      const thumb = document.createElement("div");
      thumb.className = "media-thumb";

      const image = document.createElement("img");
      image.src = item.posterFile || "";
      image.alt = `${item.title || "Programme"} thumbnail`;
      image.loading = "lazy";

      image.addEventListener("error", () => {
        thumb.innerHTML = "<div class=\"state-box\" style=\"margin: 0.7rem;\">Thumbnail not found.</div>";
      });

      image.addEventListener("click", () => {
        if (!item.videoFile) return;
        openVideoModal(item.videoFile, item.title, item.posterFile);
      });

      thumb.appendChild(image);

      const title = document.createElement("h3");
      title.className = "media-title";
      title.textContent = item.title || "Programme Recording";

      const meta = document.createElement("p");
      meta.className = "media-meta";
      meta.textContent = item.date || "Date to be updated";

      const actions = document.createElement("div");
      actions.className = "media-actions";

      const play = document.createElement("button");
      play.className = "btn-chip";
      play.type = "button";
      play.textContent = "Play Video";
      play.addEventListener("click", () => {
        if (!item.videoFile) return;
        openVideoModal(item.videoFile, item.title, item.posterFile);
      });

      actions.appendChild(play);

      card.appendChild(thumb);
      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(actions);
      recordingsGrid.appendChild(card);
    });
  }

  function renderPosters() {
    postersGrid.innerHTML = "";

    if (!posters.length) {
      postersGrid.appendChild(makeEmptyState("No posters available yet."));
      return;
    }

    posters.forEach((item) => {
      const card = document.createElement("article");
      card.className = "media-card reveal show";

      const thumbWrap = document.createElement("div");
      thumbWrap.className = "poster-thumb-wrap";

      const image = document.createElement("img");
      image.src = item.imageFile || "";
      image.alt = `${item.title || "Programme"} poster`;
      image.loading = "lazy";

      image.addEventListener("error", () => {
        thumbWrap.innerHTML = "<div class=\"state-box\" style=\"margin: 0.7rem;\">Poster not found.</div>";
      });

      image.addEventListener("click", () => {
        if (!item.imageFile) return;
        openImageModal(item.imageFile, item.title);
      });

      thumbWrap.appendChild(image);

      const title = document.createElement("h3");
      title.className = "media-title";
      title.textContent = item.title || "Programme Poster";

      const meta = document.createElement("p");
      meta.className = "media-meta";
      meta.textContent = item.date || "Date to be updated";

      const actions = document.createElement("div");
      actions.className = "media-actions";

      const view = document.createElement("button");
      view.className = "btn-chip";
      view.type = "button";
      view.textContent = "View Full Poster";
      view.addEventListener("click", () => {
        if (!item.imageFile) return;
        openImageModal(item.imageFile, item.title);
      });

      actions.appendChild(view);

      card.appendChild(thumbWrap);
      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(actions);
      postersGrid.appendChild(card);
    });
  }

  function renderUpcoming() {
    upcomingGrid.innerHTML = "";

    if (!upcoming.length) {
      upcomingGrid.appendChild(makeEmptyState("Upcoming programme details will be published soon."));
      return;
    }

    upcoming.forEach((item) => {
      const card = document.createElement("article");
      card.className = "card reveal show";

      const meta = document.createElement("p");
      meta.className = "media-meta";
      meta.textContent = item.date || "Upcoming";

      const title = document.createElement("h3");
      title.textContent = item.title || "Upcoming Programme";

      const note = document.createElement("p");
      note.textContent = item.note || "Details will be announced shortly.";

      card.appendChild(meta);
      card.appendChild(title);
      card.appendChild(note);
      upcomingGrid.appendChild(card);
    });
  }

  function renderPreviousTimeline() {
    previousTimeline.innerHTML = "";

    if (!previous.length) {
      previousTimeline.appendChild(makeEmptyState("Previous event timeline is being updated."));
      return;
    }

    previous.forEach((item) => {
      const card = document.createElement("article");
      card.className = "timeline-item reveal show";

      const title = document.createElement("h4");
      title.textContent = item.title || "Previous Event";

      const date = document.createElement("p");
      date.className = "timeline-date";
      date.textContent = item.date || "Date unavailable";

      const note = document.createElement("p");
      note.textContent = item.note || "Community event details.";

      card.appendChild(title);
      card.appendChild(date);
      card.appendChild(note);
      previousTimeline.appendChild(card);
    });
  }

  modalClose.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("show")) {
      closeModal();
    }
  });

  renderRecordings();
  renderPosters();
  renderUpcoming();
  renderPreviousTimeline();
})();
