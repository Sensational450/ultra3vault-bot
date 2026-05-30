// ================= ULTRA3VAULT FRONTEND LOGIC =================

console.log("🚀 Ultra3Vault Landing Page Loaded");

// Smooth scroll for buttons
document.querySelectorAll("a[href^='#']").forEach(btn => {
    btn.addEventListener("click", (e) => {
        e.preventDefault();

        const target = document.querySelector(btn.getAttribute("href"));

        if (target) {
            target.scrollIntoView({
                behavior: "smooth"
            });
        }
    });
});

// Simple animation on scroll
const cards = document.querySelectorAll(".card, .plan");

const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.transform = "translateY(0)";
            entry.target.style.opacity = "1";
        }
    });
}, {
    threshold: 0.2
});

cards.forEach(card => {
    card.style.opacity = "0";
    card.style.transform = "translateY(20px)";
    card.style.transition = "0.5s ease";
    observer.observe(card);
});

// Pricing highlight hover effect
document.querySelectorAll(".plan").forEach(plan => {
    plan.addEventListener("mouseenter", () => {
        plan.style.transform = "scale(1.05)";
        plan.style.transition = "0.3s";
    });

    plan.addEventListener("mouseleave", () => {
        plan.style.transform = "scale(1)";
    });
});