#!/usr/bin/env ruby
# Adiciona o GoogleService-Info.plist como recurso do app no projeto Xcode.
# Necessário porque copiar o arquivo pra pasta sozinho não é suficiente — o
# Xcode só inclui no app compilado o que está referenciado no .xcodeproj, e a
# gente não tem Xcode/interface gráfica pra arrastar o arquivo manualmente
# (build roda 100% na nuvem via Codemagic, sem Mac local).
require 'xcodeproj'

project_path = 'ios/App/App.xcodeproj'
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == 'App' } || project.targets.first
group = project.main_group.groups.find { |g| g.path == 'App' || g.name == 'App' } || project.main_group

plist_path = 'GoogleService-Info.plist'
existing = group.files.find { |f| f.path == 'GoogleService-Info.plist' }

if existing
  puts 'GoogleService-Info.plist já referenciado no projeto — nada a fazer.'
else
  file_ref = group.new_reference(plist_path)
  target.resources_build_phase.add_file_reference(file_ref)
  puts 'GoogleService-Info.plist adicionado ao projeto Xcode com sucesso.'
end

# Habilita a capability de Push Notifications apontando pro arquivo de
# entitlements (aps-environment) — sem isso o app builda, mas a Apple recusa
# o push em produção porque o binário não declara a permissão.
target.build_configurations.each do |config|
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
end
project.save
puts 'CODE_SIGN_ENTITLEMENTS configurado (App/App.entitlements).'
