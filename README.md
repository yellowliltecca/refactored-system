# HoneyVine — сайт магазина натурального мёда

Адаптивный frontend интернет-магазина в тёплой золотисто-кремовой стилистике референса.

## Файлы

- `index.html` — структура магазина и все секции.
- `styles.css` — адаптивный дизайн, каталог 4 × 2, медовый разделитель, отзывы, контакты.
- `script.js` — корзина, фильтрация каталога, мобильное меню и формы заявок.
- `bee-scene.js` — однократная прозрачная 3D-анимация: восемь увеличенных пчёл влетают с разных границ экрана и пересекают его, улетая за противоположные края.
- `jar-bees.js` — постоянная 3D-анимация трёх пчёл вокруг крышки банки с отдельными взмахами крыльев и естественным разворотом по траектории.
- `assets/bee.glb` — переданная 3D-модель пчелы.
- `assets/hero-honey-cutout.webp` — банка с прозрачным фоном для главного экрана; PNG-исходник также находится рядом.
- `assets/honey-drips-seamless.png` — высокодетализированный PNG с настоящим альфа-каналом: реалистичная глянцевая медовая кайма с неравномерными потёками; накладывается на стык hero и блока Sweet Honey без прямоугольного фона.
- `assets/bee-sprite.png` — фронтальный fallback-рендер той же модели на случай блокировки WebGL/CDN.
- `assets/*.webp` — изображения главного экрана, товаров, медового блока и отзыва.

## Запуск

Из папки проекта:

```bash
python -m http.server 8000
```

Открой `http://localhost:8000`.

Для 3D-анимации Three.js и GLTFLoader загружаются с jsDelivr CDN, а модель пчелы — локально из `assets/bee.glb`. Страница магазина отображается сразу: заставки загрузки нет. При входе восемь пчёл стартуют за пределами видимой области с разных сторон сайта — слева, справа, сверху и снизу. Каждая пересекает экран по своей плавной изогнутой траектории и полностью улетает за противоположную границу. Размер стартовых пчёл увеличен примерно на 35–40%; корпус разворачивается по направлению движения и наклоняется на виражах. CSS-fallback повторяет схему пролёта от края до края. Мордочка модели находится на локальной оси -Z, а жало — на +Z. Во время анимации мордочка ориентируется по фактическому вектору движения, а корпус плавно наклоняется на поворотах. Главный рендер банки использует изображение с прозрачным фоном. Медовый разделитель — отдельный прозрачный PNG `assets/honey-drips-seamless.png`. У изображения нет фоновой заливки: только объёмная медовая кайма с бликами и янтарными тенями. Она перекрывает стык hero и блока Sweet Honey, а контент второго блока начинается ниже капель.


### Исправление визуального перехода
- `assets/honey-drips-seamless.png`: прозрачный PNG с мягким вписыванием верхней кромки в золотистый фон, без прямой белой линии.
- Потёки расположены с небольшим заходом на первый экран, поэтому на стыке секций не видно прямоугольной границы.
- `assets/feature-honey-hex.png`: изображение второго блока с вырезанным фоном вокруг шестиугольника.
- Компоновка и отступы адаптированы для десктопа, планшета и мобильных устройств.


### Переход с медовыми потёками
Один адаптивный элемент `<picture>` на границе первого экрана и Sweet Honey: на ПК `honey-drips-desktop-refined.png`, на телефоне `honey-drips-seamless.png`. Дополнительных капель над каталогом нет.


### Анимация пчёл над банкой
- Для анимации используется та же переданная модель `assets/bee.glb` (`minecraft_-_bee.glb`), без замены на другую модель.
- Три экземпляра модели увеличены примерно на 20–30% и движутся по независимым плавным траекториям вокруг крышки; крылья анимируются через pivot-группы `left_wing` и `right_wing`.
- Анимация запускается после завершения стартового разлёта, чтобы пчёлы не перегружали первый экран одновременно.
- На мобильных устройствах область полёта пересчитывается относительно реальных размеров изображения банки. При недоступности WebGL предусмотрен лёгкий fallback на спрайты; при `prefers-reduced-motion` отключаются взмахи крыльев и дополнительное покачивание.
- Атрибуция модели: trmhtk2 / Sketchfab, https://sketchfab.com/trmhtk2, лицензия CC BY 4.0: https://creativecommons.org/licenses/by/4.0/.


### Jar bees on first paint
The three supplied 3D bees start orbiting the jar as soon as the GLB is ready, concurrently with the independent edge-to-edge entrance fly-by. Small animated bee sprites are shown only while the GLB is loading or if WebGL is unavailable.


### Bee layering fix
The entrance fly-by remains a full-screen foreground layer. The three bees orbiting the jar now render on their own fixed viewport canvas above the entrance animation, with viewport-based lid coordinates updated on scroll and resize. The hero section is no longer raised above the entrance swarm, so neither animation is hidden behind the page background.


### Larger jar bee swarm
The jar-lid orbit now uses seven 3D bee instances with different speeds, directions, orbit widths, vertical drift and depth offsets. The lightweight fallback also creates seven independently animated bee sprites so the swarm remains visible if WebGL is unavailable.


### Mobile and tablet layout refinement
The hero keeps the desktop visual hierarchy at tablet widths and switches to a deliberate stacked composition on phones. The jar image uses a centered contain-fit box so the complete jar remains visible; the honey-drip divider is scaled and horizontally clipped to the viewport; the Sweet Honey copy starts below the drip tips. Tested responsive widths: 360, 480, 561, 768, and 1440 CSS pixels.


### Interactive bees
- Tap/click an individual bee above the hero jar on desktop or mobile.
- Each of its first three taps makes it flash angry red for one second.
- On the fourth tap, that specific bee disappears in a short, blocky Minecraft-style smoke puff.
- The behavior also works with the lightweight sprite fallback if WebGL/Three.js cannot load.
