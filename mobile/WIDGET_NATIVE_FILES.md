# Android Widget - Native Files Documentation

## ⚠️ Important Note About Android Native Files

The Android native files for the widget are located in the `android/` directory, which is **gitignored** by default in Expo/React Native projects. This is standard practice since the Android folder is typically auto-generated.

However, for the widget implementation, we created **custom native code** that should be preserved.

## Native Files Created (Not in Git)

### Kotlin Source Files
Located in: `android/app/src/main/java/com/jeevagonath/algotrades/widget/`

1. **PnLWidgetProvider.kt** (167 lines)
   - Main widget provider class
   - Handles widget lifecycle and updates
   - Manages SharedPreferences for data persistence

2. **WidgetUpdateModule.kt** (48 lines)
   - React Native bridge module
   - Exposes native methods to JavaScript

3. **WidgetUpdatePackage.kt** (18 lines)
   - Package registration for React Native

### XML Resource Files

#### Layout
- `android/app/src/main/res/layout/widget_pnl.xml` (134 lines)
  - Widget UI layout

#### Metadata
- `android/app/src/main/res/xml/widget_info.xml` (12 lines)
  - Widget configuration

#### Drawable
- `android/app/src/main/res/drawable/widget_background.xml` (13 lines)
  - Widget background gradient

#### Values
- `android/app/src/main/res/values/colors.xml` (modified)
  - Added widget colors

- `android/app/src/main/res/values/strings.xml` (modified)
  - Added widget strings

### Modified Files

1. **MainApplication.kt**
   - Added: `import com.jeevagonath.algotrades.widget.WidgetUpdatePackage`
   - Added: `add(WidgetUpdatePackage())` in packages list

2. **AndroidManifest.xml**
   - Added widget receiver declaration

## Files Committed to Git

✅ The following TypeScript/JavaScript files **are** in git:

1. `src/services/widget.service.ts` (new)
2. `src/services/socket.ts` (modified)
3. `app/(tabs)/index.tsx` (modified)

## Backup Strategy

Since the Android native files are not in git, you should:

### Option 1: Keep Local Backup
- Keep a backup of the `android/app/src/main/java/com/jeevagonath/algotrades/widget/` folder
- Keep a backup of the modified resource files

### Option 2: Force Add to Git (Not Recommended)
```bash
git add -f android/app/src/main/java/com/jeevagonath/algotrades/widget/
git add -f android/app/src/main/res/layout/widget_pnl.xml
git add -f android/app/src/main/res/xml/widget_info.xml
git add -f android/app/src/main/res/drawable/widget_background.xml
git add -f android/app/src/main/res/values/colors.xml
git add -f android/app/src/main/res/values/strings.xml
git add -f android/app/src/main/AndroidManifest.xml
git add -f android/app/src/main/java/com/jeevagonath/algotrades/MainApplication.kt
git commit -m "Add Android widget native files"
git push
```

### Option 3: Update .gitignore (Recommended)
Add exceptions to `.gitignore` to track only the widget files:

```gitignore
# In mobile/.gitignore, add:
!android/app/src/main/java/com/jeevagonath/algotrades/widget/
!android/app/src/main/res/layout/widget_pnl.xml
!android/app/src/main/res/xml/widget_info.xml
!android/app/src/main/res/drawable/widget_background.xml
```

## Rebuilding the Widget

If you need to rebuild the widget on a new machine or after `android/` folder is regenerated:

1. Run `npx expo prebuild` to regenerate the Android folder
2. Copy the widget files from backup to their locations
3. Modify `MainApplication.kt` and `AndroidManifest.xml` as documented
4. Rebuild the app

## Current Git Commit

**Commit**: `96a47b2`
**Message**: "feat: Add Android home screen widget for live P&L display"

**Files in this commit:**
- `mobile/src/services/widget.service.ts` (new)
- `mobile/src/services/socket.ts` (modified)
- `mobile/app/(tabs)/index.tsx` (modified)

**Total changes**: 154 insertions(+), 4 deletions(-)

## Next Steps

1. **Decide on backup strategy** for Android native files
2. **Build and test** the widget on a device
3. **Document** the widget setup process for team members
4. **Consider** updating `.gitignore` to track widget-specific files
