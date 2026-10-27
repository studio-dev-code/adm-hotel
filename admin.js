import { createBackend } from "./supabase-client.js";

const loginView = document.querySelector("#login-view");
const dashboardView = document.querySelector("#dashboard-view");
const loginForm = document.querySelector("#login-form");
const adminMessage = document.querySelector("#admin-message");
const userEmail = document.querySelector("#user-email");
const logoutButton = document.querySelector("#logout-button");
const refreshButton = document.querySelector("#refresh-button");
const board = document.querySelector("#comments-board");
const boardMessage = document.querySelector("#board-message");
const tabs = document.querySelectorAll(".tab");

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });

let backend;
let activeTab = "pending";
let comments = { pending: [], published: [] };

try {
    backend = createBackend();
} catch (error) {
    loginForm.querySelector("button[type='submit']").disabled = true;
    adminMessage.textContent = error.message;
}

function isManager(user) {
    return user?.app_metadata?.role === "admin";
}

function showLogin() {
    dashboardView.hidden = true;
    loginView.hidden = false;
}

function showDashboard(user) {
    userEmail.textContent = user.email;
    loginView.hidden = true;
    dashboardView.hidden = false;
}

function renderCard(comment, published) {
    const card = document.createElement("article");
    card.className = "comment-card";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = comment.name.trim().charAt(0).toUpperCase();

    const body = document.createElement("div");
    body.className = "comment-body";

    const head = document.createElement("div");
    head.className = "comment-head";

    const name = document.createElement("h3");
    name.textContent = comment.name;

    const rating = document.createElement("span");
    rating.className = "comment-rating";
    rating.setAttribute("aria-label", `Nota: ${comment.rating} de 5 estrelas`);
    rating.textContent = `${"★".repeat(comment.rating)}${"☆".repeat(5 - comment.rating)}`;

    head.append(name, rating);

    const date = document.createElement("p");
    date.className = "comment-date";
    date.textContent = dateFormat.format(new Date(comment.created_at));

    const content = document.createElement("p");
    content.className = "comment-content";
    content.textContent = comment.content;

    const actions = document.createElement("div");
    actions.className = "comment-actions";

    if (!published) {
        const publish = document.createElement("button");
        publish.type = "button";
        publish.className = "btn-publish";
        publish.dataset.action = "publish";
        publish.dataset.id = comment.id;
        publish.textContent = "Publicar";
        actions.append(publish);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-delete";
    remove.dataset.action = "delete";
    remove.dataset.id = comment.id;
    remove.textContent = "Excluir";
    actions.append(remove);

    body.append(head, date, content, actions);
    card.append(avatar, body);
    return card;
}

function renderStats() {
    const { pending, published } = comments;
    document.querySelector("#stat-pending").textContent = pending.length;
    document.querySelector("#stat-published").textContent = published.length;
    document.querySelector("#tab-pending-count").textContent = pending.length;
    document.querySelector("#tab-published-count").textContent = published.length;

    const average = published.length
        ? (published.reduce((sum, item) => sum + item.rating, 0) / published.length).toFixed(1).replace(".", ",")
        : "—";
    document.querySelector("#stat-average").textContent = average;
}

function renderBoard() {
    const list = comments[activeTab];
    const published = activeTab === "published";

    board.replaceChildren(...list.map((comment) => renderCard(comment, published)));

    if (list.length === 0) {
        boardMessage.textContent = published
            ? "Nenhum comentário publicado ainda."
            : "Tudo em dia! Não há comentários aguardando revisão.";
    } else {
        boardMessage.textContent = "";
    }
}

async function loadComments() {
    boardMessage.textContent = "Carregando comentários...";

    const { data, error } = await backend
        .from("comments")
        .select("id, name, rating, content, status, created_at")
        .order("created_at", { ascending: false });

    if (error) {
        throw error;
    }

    comments = {
        pending: data.filter((item) => item.status === "pending"),
        published: data.filter((item) => item.status === "approved"),
    };

    renderStats();
    renderBoard();
}

function setActiveTab(tab) {
    activeTab = tab;
    tabs.forEach((button) => {
        const selected = button.dataset.tab === tab;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-selected", String(selected));
    });
    renderBoard();
}

async function openModeration(user) {
    if (!isManager(user)) {
        await backend.auth.signOut();
        showLogin();
        adminMessage.textContent = "Esta conta não tem permissão de administração.";
        return;
    }

    showDashboard(user);

    try {
        await loadComments();
    } catch (error) {
        boardMessage.textContent = `Não foi possível carregar os comentários: ${error.message}`;
    }
}

if (backend) {
    backend.auth.getSession().then(({ data, error }) => {
        if (error) {
            adminMessage.textContent = `Não foi possível verificar a sessão: ${error.message}`;
            return;
        }

        if (data.session) {
            return openModeration(data.session.user);
        }
    }).catch((error) => {
        adminMessage.textContent = `Não foi possível validar o acesso: ${error.message}`;
    });

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = loginForm.querySelector("button[type='submit']");
        button.disabled = true;
        adminMessage.textContent = "Verificando acesso...";

        try {
            const formData = new FormData(loginForm);
            const { data, error } = await backend.auth.signInWithPassword({
                email: formData.get("email").trim().toLowerCase(),
                password: formData.get("password"),
            });

            if (error) {
                throw error;
            }

            loginForm.reset();
            adminMessage.textContent = "";
            await openModeration(data.user);
        } catch (error) {
            adminMessage.textContent = `Não foi possível entrar: ${error.message}`;
        } finally {
            button.disabled = false;
        }
    });

    logoutButton.addEventListener("click", async () => {
        const { error } = await backend.auth.signOut();

        if (error) {
            boardMessage.textContent = `Não foi possível sair: ${error.message}`;
            return;
        }

        showLogin();
        adminMessage.textContent = "Você saiu da área administrativa.";
    });

    refreshButton.addEventListener("click", () => {
        loadComments().catch((error) => {
            boardMessage.textContent = `Não foi possível atualizar: ${error.message}`;
        });
    });

    tabs.forEach((button) => button.addEventListener("click", () => setActiveTab(button.dataset.tab)));

    board.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");

        if (!button) {
            return;
        }

        const { action, id } = button.dataset;

        if (action === "delete" && !window.confirm("Excluir este comentário permanentemente?")) {
            return;
        }

        button.disabled = true;

        try {
            const result = action === "publish"
                ? await backend.from("comments").update({ status: "approved" }).eq("id", id)
                : await backend.from("comments").delete().eq("id", id);

            if (result.error) {
                throw result.error;
            }

            await loadComments();
        } catch (error) {
            boardMessage.textContent = `Não foi possível ${action === "publish" ? "publicar" : "excluir"}: ${error.message}`;
            button.disabled = false;
        }
    });
}
