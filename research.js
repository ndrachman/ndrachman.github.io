document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded');
    const researchItems = document.querySelectorAll('.research-item');
    const researchContents = document.querySelectorAll('.research-content');
    console.log('Found research items:', researchItems.length);
    console.log('Found research contents:', researchContents.length);

    researchItems.forEach(item => {
        item.addEventListener('click', function(e) {
            console.log('Item clicked:', this.getAttribute('data-target'));
            e.preventDefault();
            const targetId = this.getAttribute('data-target');
            const targetContent = document.getElementById(targetId);
            console.log('Target content:', targetContent);

            if (targetContent) {
                researchContents.forEach(content => {
                    if (content.id === targetId) {
                        content.classList.toggle('active');
                        console.log('Toggled active class for:', targetId);
                    } else {
                        content.classList.remove('active');
                    }
                });
            }
        });
    });
});
