use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";
const IDEAS_DIR: &str = "ideas";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PixelCanvas {
    pub width: u16,
    pub height: u16,
    pub pixels: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Idea {
    pub id: String,
    pub kind: String,
    pub title: Option<String>,
    pub body: String,
    pub canvas: Option<PixelCanvas>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeaInput {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub canvas: Option<PixelCanvas>,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageSettings {
    pub storage_dir: String,
    pub ideas_dir: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SettingsFile {
    storage_dir: Option<String>,
}

#[tauri::command]
fn get_storage_settings(app: AppHandle) -> Result<StorageSettings, String> {
    let storage_dir = resolve_storage_dir(&app)?;
    let ideas_dir = ensure_ideas_dir(&storage_dir)?;

    Ok(StorageSettings {
        storage_dir: storage_dir.to_string_lossy().to_string(),
        ideas_dir: ideas_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn choose_storage_dir(app: AppHandle) -> Result<Option<StorageSettings>, String> {
    let Some(folder) = rfd::FileDialog::new()
        .set_title("选择 Mnemosyne 灵感存储文件夹")
        .pick_folder()
    else {
        return Ok(None);
    };

    write_settings(
        &app,
        &SettingsFile {
            storage_dir: Some(folder.to_string_lossy().to_string()),
        },
    )?;

    let ideas_dir = ensure_ideas_dir(&folder)?;
    Ok(Some(StorageSettings {
        storage_dir: folder.to_string_lossy().to_string(),
        ideas_dir: ideas_dir.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
fn list_ideas(app: AppHandle) -> Result<Vec<Idea>, String> {
    let storage_dir = resolve_storage_dir(&app)?;
    let ideas_dir = ensure_ideas_dir(&storage_dir)?;
    let mut ideas = Vec::new();

    for entry in fs::read_dir(ideas_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let contents = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        match serde_json::from_str::<Idea>(&contents) {
            Ok(idea) => ideas.push(idea),
            Err(error) => eprintln!("Skipping invalid idea file {}: {error}", path.display()),
        }
    }

    ideas.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(ideas)
}

#[tauri::command]
fn save_idea(app: AppHandle, input: IdeaInput) -> Result<Idea, String> {
    let storage_dir = resolve_storage_dir(&app)?;
    let ideas_dir = ensure_ideas_dir(&storage_dir)?;
    let now = now_iso();
    let path = idea_path(&ideas_dir, &input.id)?;

    // 旧版 JSON 可能没有 title；创建时间仍从旧文件继承，避免保存后变成新灵感。
    let created_at = input.created_at.unwrap_or_else(|| {
        fs::read_to_string(&path)
            .ok()
            .and_then(|contents| serde_json::from_str::<Idea>(&contents).ok())
            .map(|idea| idea.created_at)
            .unwrap_or_else(|| now.clone())
    });

    let idea = Idea {
        id: input.id,
        kind: input.kind,
        title: Some(input.title),
        body: input.body,
        canvas: input.canvas,
        created_at,
        updated_at: now,
    };

    let contents = serde_json::to_string_pretty(&idea).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())?;
    Ok(idea)
}

#[tauri::command]
fn delete_idea(app: AppHandle, id: String) -> Result<(), String> {
    let storage_dir = resolve_storage_dir(&app)?;
    let ideas_dir = ensure_ideas_dir(&storage_dir)?;
    let path = idea_path(&ideas_dir, &id)?;

    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn export_markdown(title: String, body: String) -> Result<Option<String>, String> {
    let default_name = format!("{}.md", safe_file_stem(&title, "text-record"));
    let Some(path) = rfd::FileDialog::new()
        .set_title("另存为 Markdown")
        .set_file_name(&default_name)
        .add_filter("Markdown", &["md"])
        .save_file()
    else {
        return Ok(None);
    };

    fs::write(&path, body).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
fn export_canvas_jpeg(title: String, canvas: PixelCanvas) -> Result<Option<String>, String> {
    let default_name = format!("{}.jpg", safe_file_stem(&title, "pixel-canvas"));
    let Some(path) = rfd::FileDialog::new()
        .set_title("另存为 JPEG 图像")
        .set_file_name(&default_name)
        .add_filter("JPEG", &["jpg", "jpeg"])
        .save_file()
    else {
        return Ok(None);
    };

    let image = canvas_to_image(&canvas)?;
    image.save_with_format(&path, image::ImageFormat::Jpeg).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
fn import_image_canvas(size: u16, crop: bool) -> Result<Option<PixelCanvas>, String> {
    let Some(path) = rfd::FileDialog::new()
        .set_title("导入图片为像素画布")
        .add_filter("Image", &["jpg", "jpeg", "png"])
        .pick_file()
    else {
        return Ok(None);
    };

    let image = image::open(path).map_err(|error| error.to_string())?;
    Ok(Some(image_to_canvas(image, size, crop)?))
}

#[tauri::command]
fn resize_canvas(canvas: PixelCanvas, size: u16, crop: bool) -> Result<PixelCanvas, String> {
    let image = DynamicImage::ImageRgb8(canvas_to_image(&canvas)?);
    image_to_canvas(image, size, crop)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_storage_settings,
            choose_storage_dir,
            list_ideas,
            save_idea,
            delete_idea,
            export_markdown,
            export_canvas_jpeg,
            import_image_canvas,
            resize_canvas
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mnemosyne");
}

fn resolve_storage_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let settings = read_settings(app)?;
    let path = match settings.storage_dir {
        Some(value) => PathBuf::from(value),
        None => app.path().app_data_dir().map_err(|error| error.to_string())?,
    };

    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn ensure_ideas_dir(storage_dir: &Path) -> Result<PathBuf, String> {
    let ideas_dir = storage_dir.join(IDEAS_DIR);
    fs::create_dir_all(&ideas_dir).map_err(|error| error.to_string())?;
    Ok(ideas_dir)
}

// 只允许 UUID 风格文件名，防止前端传入路径穿越字符。
fn idea_path(ideas_dir: &Path, id: &str) -> Result<PathBuf, String> {
    if !id.chars().all(|character| character.is_ascii_alphanumeric() || character == '-') {
        return Err("Invalid idea id.".to_string());
    }

    Ok(ideas_dir.join(format!("{id}.json")))
}

fn read_settings(app: &AppHandle) -> Result<SettingsFile, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(SettingsFile::default());
    }

    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

fn write_settings(app: &AppHandle, settings: &SettingsFile) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let contents = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join(SETTINGS_FILE))
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn canvas_to_image(canvas: &PixelCanvas) -> Result<ImageBuffer<Rgb<u8>, Vec<u8>>, String> {
    let expected = canvas.width as usize * canvas.height as usize;
    if canvas.pixels.len() != expected {
        return Err("Canvas pixel count does not match its size.".to_string());
    }

    let mut image = ImageBuffer::new(canvas.width as u32, canvas.height as u32);
    for (index, pixel) in canvas.pixels.iter().enumerate() {
        let color = parse_hex_color(pixel)?;
        let x = index as u32 % canvas.width as u32;
        let y = index as u32 / canvas.width as u32;
        image.put_pixel(x, y, Rgb(color));
    }

    Ok(image)
}

fn image_to_canvas(image: DynamicImage, size: u16, crop: bool) -> Result<PixelCanvas, String> {
    let safe_size = size.clamp(4, 512);
    let prepared = if crop {
        center_crop_square(image)
    } else {
        pad_to_square(image)
    };
    let resized = prepared
        .resize_exact(safe_size as u32, safe_size as u32, FilterType::Nearest)
        .to_rgb8();

    let pixels = resized
        .pixels()
        .map(|pixel| format!("#{:02x}{:02x}{:02x}", pixel[0], pixel[1], pixel[2]))
        .collect();

    Ok(PixelCanvas {
        width: safe_size,
        height: safe_size,
        pixels,
    })
}

fn center_crop_square(image: DynamicImage) -> DynamicImage {
    let (width, height) = image.dimensions();
    let side = width.min(height);
    let x = (width - side) / 2;
    let y = (height - side) / 2;
    image.crop_imm(x, y, side, side)
}

fn pad_to_square(image: DynamicImage) -> DynamicImage {
    let rgb = image.to_rgb8();
    let (width, height) = rgb.dimensions();
    let side = width.max(height);
    let mut padded = ImageBuffer::from_pixel(side, side, Rgb([255, 255, 255]));
    let x_offset = (side - width) / 2;
    let y_offset = (side - height) / 2;

    for y in 0..height {
        for x in 0..width {
            let pixel = *rgb.get_pixel(x, y);
            padded.put_pixel(x + x_offset, y + y_offset, pixel);
        }
    }

    DynamicImage::ImageRgb8(padded)
}

fn parse_hex_color(value: &str) -> Result<[u8; 3], String> {
    let hex = value.strip_prefix('#').unwrap_or(value);
    if hex.len() != 6 {
        return Err(format!("Invalid color value: {value}"));
    }

    let red = u8::from_str_radix(&hex[0..2], 16).map_err(|error| error.to_string())?;
    let green = u8::from_str_radix(&hex[2..4], 16).map_err(|error| error.to_string())?;
    let blue = u8::from_str_radix(&hex[4..6], 16).map_err(|error| error.to_string())?;
    Ok([red, green, blue])
}

fn safe_file_stem(value: &str, fallback: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else if character.is_whitespace() {
                '-'
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches(['-', '_']);

    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}
