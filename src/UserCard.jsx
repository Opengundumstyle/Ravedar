function UserCard({ user }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg flex flex-col items-center w-full max-w-md h-[70vh] mx-auto transition-all duration-300 p-1 cursor-pointer">
      <div className="bg-white bg-opacity-80 rounded-2xl flex flex-col items-center w-full h-full p-0">
        {/* Photo area: 65% of card height, fixed aspect ratio, cropped */}
        <div className="w-full flex-shrink-0 flex justify-center items-center" style={{ height: '65%' }}>
          <div className="w-full h-full aspect-[4/5] max-h-full rounded-t-2xl overflow-hidden bg-gray-100 border-b border-gray-200 flex items-center justify-center">
            {user.photos && user.photos.length > 0 ? (
              <img
                src={user.photos[0].image_url}
                alt="User pic"
                className="w-full h-full object-cover object-top bg-gray-100"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">No Photo</div>
            )}
          </div>
        </div>
        {/* Info area: 35% of card height */}
        <div className="flex flex-col justify-between w-full px-4 py-3" style={{ height: '35%' }}>
          <div className="font-bold text-lg sm:text-xl md:text-2xl text-gray-800 text-center truncate w-full">
            {user.name} {user.instagram && <span className="text-gray-400 text-base">@{user.instagram}</span>}
          </div>
          <div className="text-sm sm:text-base text-gray-600 text-center w-full break-words line-clamp-3 min-h-[3.5em]">
            {user.about_me}
          </div>
          {user.vibe_tags && user.vibe_tags.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center max-h-12 overflow-y-auto mt-2">
              {user.vibe_tags.map((tag, i) => (
                <span key={i} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserCard; 